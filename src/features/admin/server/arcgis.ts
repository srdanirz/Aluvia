import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { z } from "zod";

// A survey layer of a few thousand homes is a few pages; more than this is the wrong layer.
const MAX_FEATURES = 20_000;
const PAGE_TIMEOUT_MS = 30_000;

export type Fetch = typeof fetch;
// Narrower than typeof lookup (which is overloaded): exactly the one shape this module calls,
// so a test can pass a plain function in its place instead of fighting the overloads.
export type Lookup = (
  hostname: string,
  options: { all: true; verbatim?: boolean },
) => Promise<{ address: string; family: number }[]>;

/** One feature as GeoJSON in WGS 84, with the layer's own id and its attributes as strings. */
export type LayerFeature = { objectId: string; geometry: unknown; attributes: Record<string, string> };

export class LayerError extends Error {
  constructor(
    readonly code: "invalid_layer_url" | "layer_unreachable" | "layer_too_large" | "layer_unsupported",
  ) {
    super(code);
  }
}

/**
 * A FeatureServer layer URL (`https://…/FeatureServer/0`): only https, and a quick syntactic
 * rejection of an IP literal or an obviously local name. This alone does not stop a public
 * hostname that resolves to an internal address; `assertPublicHost` is the real guard, checked
 * on every request against the address actually returned.
 */
export function parseLayerUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LayerError("invalid_layer_url");
  }
  const host = url.hostname;
  const isIp = /^[0-9.]+$/.test(host) || host.includes(":");
  const isLocal =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".");
  if (url.protocol !== "https:" || isIp || isLocal || !/\/FeatureServer\/\d+$/.test(url.pathname)) {
    throw new LayerError("invalid_layer_url");
  }
  url.search = "";
  url.hash = "";
  return url;
}

// Loopback, current-network, private (RFC 1918), link-local (and cloud metadata, which lives
// there), CGNAT, IPv4-mapped and multicast/reserved: an admin-typed hostname must resolve
// outside all of them, or the server becomes a proxy into its own network.
const PRIVATE_IPV4 =
  /^(127\.|0\.|10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|23\d\.)/;
const PRIVATE_IPV6 = /^(::1$|::$|fc|fd|fe[89ab]|ff|::ffff:)/i;

/**
 * Resolves the host and rejects it if any address is private, loopback or link-local, so a
 * public-looking hostname that points at the server's own network (DNS rebinding, or a cloud
 * metadata alias) cannot be reached. Checked again on every request, not only once, to shrink
 * the window between a changed DNS record and the fetch that follows.
 */
async function assertPublicHost(hostname: string, lookupImpl: Lookup): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new LayerError("layer_unreachable");
  }
  for (const { address } of addresses) {
    const version = isIP(address);
    if (version === 0) throw new LayerError("layer_unreachable");
    const isPrivate = version === 4 ? PRIVATE_IPV4.test(address) : PRIVATE_IPV6.test(address);
    if (isPrivate) throw new LayerError("invalid_layer_url");
  }
}

const metadataSchema = z.object({
  objectIdField: z.string().min(1),
  maxRecordCount: z.number().int().positive().default(1000),
  geometryType: z.string(),
});

const pageSchema = z.object({
  features: z.array(
    z.object({
      id: z.union([z.number(), z.string()]).optional(),
      geometry: z.unknown(),
      properties: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  properties: z.object({ exceededTransferLimit: z.boolean().optional() }).optional(),
  exceededTransferLimit: z.boolean().optional(),
});

async function getJson(fetchImpl: Fetch, lookupImpl: Lookup, url: URL): Promise<unknown> {
  await assertPublicHost(url.hostname, lookupImpl);
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), redirect: "error" });
  } catch {
    throw new LayerError("layer_unreachable");
  }
  if (!response.ok) throw new LayerError("layer_unreachable");
  const body: unknown = await response.json().catch(() => {
    throw new LayerError("layer_unsupported");
  });
  // ArcGIS answers errors with 200 and an `error` object.
  if (body && typeof body === "object" && "error" in body) throw new LayerError("layer_unreachable");
  return body;
}

/**
 * Every feature of a layer, page by page, reprojected to WGS 84 by the server (`outSR=4326`).
 * Pages are sequential: each needs the previous offset.
 */
export async function fetchLayerFeatures(
  rawUrl: string,
  {
    fetchImpl = fetch,
    lookupImpl = lookup,
    expect,
  }: { fetchImpl?: Fetch; lookupImpl?: Lookup; expect: "polygon" | "any" },
): Promise<LayerFeature[]> {
  const url = parseLayerUrl(rawUrl);
  const metadataUrl = new URL(url);
  metadataUrl.searchParams.set("f", "json");
  const metadata = metadataSchema.safeParse(await getJson(fetchImpl, lookupImpl, metadataUrl));
  if (!metadata.success) throw new LayerError("layer_unsupported");
  if (expect === "polygon" && metadata.data.geometryType !== "esriGeometryPolygon") {
    throw new LayerError("layer_unsupported");
  }
  const { objectIdField, maxRecordCount } = metadata.data;

  async function page(offset: number): Promise<LayerFeature[]> {
    if (offset >= MAX_FEATURES) throw new LayerError("layer_too_large");
    const query = new URL(`${url.href}/query`);
    for (const [key, value] of Object.entries({
      where: "1=1",
      outFields: "*",
      outSR: "4326",
      f: "geojson",
      orderByFields: objectIdField,
      resultOffset: String(offset),
      resultRecordCount: String(maxRecordCount),
    })) {
      query.searchParams.set(key, value);
    }
    const parsed = pageSchema.safeParse(await getJson(fetchImpl, lookupImpl, query));
    if (!parsed.success) throw new LayerError("layer_unsupported");
    const features = parsed.data.features.map((feature) => {
      const properties = feature.properties ?? {};
      const objectId = properties[objectIdField] ?? feature.id;
      if (objectId === undefined || objectId === null) throw new LayerError("layer_unsupported");
      const attributes = Object.fromEntries(
        Object.entries(properties)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value).trim()]),
      );
      return { objectId: String(objectId), geometry: feature.geometry, attributes };
    });
    const more =
      parsed.data.exceededTransferLimit ??
      parsed.data.properties?.exceededTransferLimit ??
      features.length === maxRecordCount;
    return more && features.length > 0 ? [...features, ...(await page(offset + features.length))] : features;
  }

  return page(0);
}
