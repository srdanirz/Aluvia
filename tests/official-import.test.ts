import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Lookup, LayerError, parseLayerUrl } from "@/features/admin/server/arcgis";
import { importOfficialLayer } from "@/features/admin/server/official-import";
import { emergencies, users, workItems, worksiteContacts, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

// Invented layers only (STYLEGUIDE, Tests): squares near 0,0 and made-up streets.
const LAYER = "https://gis.example.test/arcgis/rest/services/Parcels/FeatureServer/0";
const PAGE_SIZE = 3;
// The tests' own allowlist; production defaults to Esri's hosted services (env.ts).
const ALLOWED = ["example.test"];

function square(x: number, y: number, size = 0.0001) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  };
}

const PARCELS = Array.from({ length: 7 }, (_, i) => ({
  type: "Feature",
  id: i + 1,
  geometry: square(i * 0.0001, 0),
  properties: { OID: i + 1, STREET: "Calle Inventada", NUM: String(100 + i), PARCEL: `T-${i}`, EMPTY: null },
}));

/** A fake ArcGIS FeatureServer: metadata, then pages of `PAGE_SIZE` with exceededTransferLimit. */
function fakeServer(features: unknown[], geometryType = "esriGeometryPolygon"): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (!url.pathname.endsWith("/query")) {
      return Response.json({ objectIdField: "OID", maxRecordCount: PAGE_SIZE, geometryType });
    }
    const offset = Number(url.searchParams.get("resultOffset"));
    expect(url.searchParams.get("outSR")).toBe("4326");
    const page = features.slice(offset, offset + PAGE_SIZE);
    return Response.json({
      type: "FeatureCollection",
      features: page,
      exceededTransferLimit: offset + PAGE_SIZE < features.length,
    });
  }) as typeof fetch;
}

// gis.example.test (RFC 2606) resolves nowhere for real; this stands in for the public address
// a real hostname would have, so fetchLayerFeatures's own DNS check passes in tests.
const PUBLIC_IP = "93.184.216.34";
const fakeLookup: Lookup = async () => [{ address: PUBLIC_IP, family: 4 }];
const privateLookup: Lookup = async () => [{ address: "169.254.169.254", family: 4 }];

let actorId: string;

beforeAll(async () => {
  const [actor] = await db.insert(users).values({ name: "Admin importador" }).returning({ id: users.id });
  if (!actor) throw new Error("actor not created");
  actorId = actor.id;
});

describe("layer URLs", () => {
  it("accept an https FeatureServer layer and nothing that reaches the server's own network", () => {
    expect(parseLayerUrl(`${LAYER}?f=json`, ALLOWED).href).toBe(LAYER);
    expect(parseLayerUrl("https://services3.arcgis.com/x/arcgis/rest/services/P/FeatureServer/0").host).toBe(
      "services3.arcgis.com",
    );
    for (const bad of [
      LAYER.replace("https:", "http:"),
      "https://169.254.169.254/arcgis/rest/services/X/FeatureServer/0",
      "https://localhost/arcgis/rest/services/X/FeatureServer/0",
      "https://metadata.internal/arcgis/rest/services/X/FeatureServer/0",
      "https://gis.example.test/arcgis/rest/services/X/MapServer/0",
      "https://evil.example.org/arcgis/rest/services/X/FeatureServer/0",
      "https://example.test.evil.org/arcgis/rest/services/X/FeatureServer/0",
      "not a url",
    ]) {
      expect(() => parseLayerUrl(bad, ALLOWED)).toThrow(LayerError);
    }
  });
});

describe("importing parcels as homes", () => {
  it("creates affected homes with no work, contact only in worksite_contacts, in pages", async () => {
    const emergencyId = await createEmergency(db, "import-parcels");
    const input = {
      kind: "worksites" as const,
      emergencyId,
      layerUrl: LAYER,
      addressFields: ["STREET", "NUM", "EMPTY"],
      notesFields: ["PARCEL"],
    };
    const result = await importOfficialLayer(db, actorId, input, {
      fetchImpl: fakeServer(PARCELS),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    expect(result).toEqual({ ok: true, data: { featureCount: 7, createdCount: 7 } });

    const homes = await db
      .select({
        id: worksites.id,
        source: worksites.source,
        flags: worksites.reviewFlags,
        waiting: worksites.unclaimedSince,
      })
      .from(worksites)
      .where(eq(worksites.emergencyId, emergencyId));
    expect(homes).toHaveLength(7);
    expect(
      homes.every((home) => home.source === "official" && home.flags.length === 0 && home.waiting === null),
    ).toBe(true);
    const [{ items } = { items: -1 }] = await db
      .select({ items: sql<number>`count(*)::int` })
      .from(workItems)
      .where(eq(workItems.emergencyId, emergencyId));
    expect(items).toBe(0);

    const [contact] = await db
      .select({ address: worksiteContacts.addressText, notes: worksiteContacts.notes })
      .from(worksiteContacts)
      .innerJoin(worksites, eq(worksites.id, worksiteContacts.worksiteId))
      .where(eq(worksites.emergencyId, emergencyId))
      .orderBy(worksiteContacts.addressText)
      .limit(1);
    expect(contact).toEqual({ address: "Calle Inventada 100", notes: "PARCEL: T-0" });

    // The point sits inside its parcel, not on its edge.
    const [inside] = await db.execute<{ inside: boolean }>(
      sql`select bool_and(ST_Within(location, ST_MakeEnvelope(0, 0, 0.0007, 0.0001, 4326))) as inside
          from worksites where emergency_id = ${emergencyId}`,
    );
    expect(inside?.inside).toBe(true);
  });

  it("is idempotent: a second run creates nothing and costs the same statements per page", async () => {
    const emergencyId = await createEmergency(db, "import-twice");
    const input = {
      kind: "worksites" as const,
      emergencyId,
      layerUrl: LAYER,
      addressFields: ["STREET"],
      notesFields: [],
    };
    await importOfficialLayer(db, actorId, input, {
      fetchImpl: fakeServer(PARCELS),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    counter.reset();
    const again = await importOfficialLayer(db, actorId, input, {
      fetchImpl: fakeServer(PARCELS),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    expect(again).toEqual({ ok: true, data: { featureCount: 7, createdCount: 0 } });
    const queries = counter.count;

    counter.reset();
    await importOfficialLayer(db, actorId, input, {
      fetchImpl: fakeServer(PARCELS.slice(0, 1)),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    // 7 parcels fit one batch, like 1: the import does not query per home.
    expect(counter.count).toBe(queries);
  });

  it("refuses a closed emergency and maps an ArcGIS error to a code", async () => {
    const emergencyId = await createEmergency(db, "import-closed");
    const input = {
      kind: "worksites" as const,
      emergencyId,
      layerUrl: LAYER,
      addressFields: ["STREET"],
      notesFields: [],
    };
    const failing = (async () => Response.json({ error: { code: 400, message: "Invalid" } })) as typeof fetch;
    expect(
      await importOfficialLayer(db, actorId, input, {
        fetchImpl: failing,
        lookupImpl: fakeLookup,
        allowedHosts: ALLOWED,
      }),
    ).toEqual({
      ok: false,
      code: "layer_unreachable",
    });
    await db
      .update(emergencies)
      .set({ status: "closed", closedAt: sql`now()` })
      .where(eq(emergencies.id, emergencyId));
    expect(
      await importOfficialLayer(db, actorId, input, {
        fetchImpl: fakeServer(PARCELS),
        lookupImpl: fakeLookup,
        allowedHosts: ALLOWED,
      }),
    ).toEqual({
      ok: false,
      code: "emergency_closed",
    });
  });

  it("gives the same ids however the layer URL was typed", async () => {
    const emergencyId = await createEmergency(db, "import-url-variants");
    const input = {
      kind: "worksites" as const,
      emergencyId,
      layerUrl: LAYER,
      addressFields: ["STREET"],
      notesFields: [],
    };
    await importOfficialLayer(db, actorId, input, {
      fetchImpl: fakeServer(PARCELS),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    const again = await importOfficialLayer(
      db,
      actorId,
      { ...input, layerUrl: ` ${LAYER}?f=json ` },
      { fetchImpl: fakeServer(PARCELS), lookupImpl: fakeLookup, allowedHosts: ALLOWED },
    );
    expect(again).toEqual({ ok: true, data: { featureCount: 7, createdCount: 0 } });
  });

  it("refuses a body past the size cap without reading it all", async () => {
    const emergencyId = await createEmergency(db, "import-huge");
    const huge = (async () =>
      new Response("{}", { headers: { "content-length": String(60 * 1024 * 1024) } })) as typeof fetch;
    expect(
      await importOfficialLayer(
        db,
        actorId,
        { kind: "worksites", emergencyId, layerUrl: LAYER, addressFields: ["STREET"], notesFields: [] },
        { fetchImpl: huge, lookupImpl: fakeLookup, allowedHosts: ALLOWED },
      ),
    ).toEqual({ ok: false, code: "layer_too_large" });
  });

  it("refuses a public-looking hostname that resolves to a private address", async () => {
    const emergencyId = await createEmergency(db, "import-ssrf");
    const input = {
      kind: "worksites" as const,
      emergencyId,
      layerUrl: LAYER,
      addressFields: ["STREET"],
      notesFields: [],
    };
    expect(
      await importOfficialLayer(db, actorId, input, {
        fetchImpl: fakeServer(PARCELS),
        lookupImpl: privateLookup,
        allowedHosts: ALLOWED,
      }),
    ).toEqual({ ok: false, code: "invalid_layer_url" });
  });
});

describe("importing the area", () => {
  it("sets the area to the union of the layer's polygons", async () => {
    const emergencyId = await createEmergency(db, "import-area");
    const zone = [
      { type: "Feature", id: 1, geometry: square(0, 0, 0.01), properties: { OID: 1 } },
      { type: "Feature", id: 2, geometry: square(0.01, 0, 0.01), properties: { OID: 2 } },
    ];
    const result = await importOfficialLayer(
      db,
      actorId,
      { kind: "area", emergencyId, layerUrl: LAYER },
      { fetchImpl: fakeServer(zone), lookupImpl: fakeLookup, allowedHosts: ALLOWED },
    );
    expect(result).toEqual({ ok: true, data: { featureCount: 2, createdCount: 0 } });
    const [area] = await db.execute<{ type: string; valid: boolean }>(
      sql`select ST_GeometryType(area) as type, ST_IsValid(area) as valid from emergencies where id = ${emergencyId}`,
    );
    expect(area).toEqual({ type: "ST_MultiPolygon", valid: true });
  });

  it("keeps the current area when the layer comes empty", async () => {
    const emergencyId = await createEmergency(db, "import-area-empty");
    const zone = [{ type: "Feature", id: 1, geometry: square(0, 0, 0.01), properties: { OID: 1 } }];
    const area = { kind: "area" as const, emergencyId, layerUrl: LAYER };
    await importOfficialLayer(db, actorId, area, {
      fetchImpl: fakeServer(zone),
      lookupImpl: fakeLookup,
      allowedHosts: ALLOWED,
    });
    expect(
      await importOfficialLayer(db, actorId, area, {
        fetchImpl: fakeServer([]),
        lookupImpl: fakeLookup,
        allowedHosts: ALLOWED,
      }),
    ).toEqual({ ok: false, code: "layer_unsupported" });
    const [row] = await db.execute<{ has: boolean }>(
      sql`select area is not null as has from emergencies where id = ${emergencyId}`,
    );
    expect(row?.has).toBe(true);
  });

  it("rejects a layer that is not polygons", async () => {
    const emergencyId = await createEmergency(db, "import-points");
    expect(
      await importOfficialLayer(
        db,
        actorId,
        { kind: "area", emergencyId, layerUrl: LAYER },
        { fetchImpl: fakeServer([], "esriGeometryPoint"), lookupImpl: fakeLookup, allowedHosts: ALLOWED },
      ),
    ).toEqual({ ok: false, code: "layer_unsupported" });
  });
});
