import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { createWorksites, MAX_WORKSITES_PER_CALL, newWorksiteSchema } from "@/features/worksites/server";
import { adminEvents, emergencies } from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";
import { uuidV5 } from "@/shared/lib/uuid-v5";

import type { Result } from "../result";
import type { OfficialLayerInput } from "../schemas";
import {
  type Fetch,
  fetchLayerFeatures,
  type LayerFeature,
  LayerError,
  type Lookup,
  parseLayerUrl,
} from "./arcgis";

// Namespace of the ids of imported homes; never change it, or a second import duplicates them.
const OFFICIAL_IMPORT_NAMESPACE = "5b0c3d1e-8f0a-4a57-9a1e-6f2c0d4e7b13";
const ADDRESS_MAX = 500;
const NOTES_MAX = 2000;

export type ImportSummary = { featureCount: number; createdCount: number };

async function findOpenEmergency(db: Database, emergencyId: string) {
  const [row] = await db
    .select({ defaultLocale: emergencies.defaultLocale, status: emergencies.status })
    .from(emergencies)
    .where(eq(emergencies.id, emergencyId));
  return row;
}

async function logImport(
  db: Database,
  actorId: string | null,
  input: OfficialLayerInput,
  summary: ImportSummary,
) {
  const url = new URL(input.layerUrl);
  await db.insert(adminEvents).values({
    actorId,
    action: "official_layer_imported",
    targetType: "emergency",
    targetId: input.emergencyId,
    emergencyId: input.emergencyId,
    // The layer's address and counts; never a feature's attributes (they carry addresses).
    payload: { kind: input.kind, layer: `${url.host}${url.pathname}`, ...summary },
  });
}

/** Sets the emergency's area to the union of the layer's polygons, repaired if they self-intersect. */
async function importArea(db: Database, input: OfficialLayerInput, features: LayerFeature[]) {
  const geometries = JSON.stringify(features.map((f) => f.geometry).filter(Boolean));
  const [updated] = await db
    .update(emergencies)
    .set({
      area: sql`(SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(
          ST_SetSRID(ST_GeomFromGeoJSON(g::text), 4326))), 3))
        FROM jsonb_array_elements(${geometries}::jsonb) AS g)`,
      version: sql`${emergencies.version} + 1`,
    })
    .where(and(eq(emergencies.id, input.emergencyId), eq(emergencies.status, "open")))
    .returning({ id: emergencies.id });
  return updated ? features.length : 0;
}

/** Text from the mapped attributes, in the mapped order, skipping the empty ones. */
function joinFields(attributes: Record<string, string>, fields: string[], labeled: boolean) {
  return fields
    .map((field) => {
      const value = attributes[field];
      if (!value) return null;
      return labeled ? `${field}: ${value}` : value;
    })
    .filter((part): part is string => part !== null)
    .join(labeled ? "; " : " ");
}

/**
 * One batch of parcels as homes: an interior point of each polygon (computed by PostGIS, one
 * query for the batch), no work items, the mapped address and notes as contact only.
 */
async function importHomesBatch(
  db: Database,
  input: OfficialLayerInput & { kind: "worksites" },
  layerKey: string,
  locale: string,
  batch: LayerFeature[],
): Promise<number> {
  const points = await db.execute<{ ord: number; lng: number; lat: number }>(sql`
    SELECT t.ord::int AS ord, ST_X(p) AS lng, ST_Y(p) AS lat
    FROM jsonb_array_elements(${JSON.stringify(batch.map((f) => f.geometry))}::jsonb) WITH ORDINALITY AS t (g, ord),
      LATERAL (SELECT ST_PointOnSurface(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(t.g::text), 4326))) AS p) AS s
  `);
  const pointByOrd = new Map(points.map((row) => [row.ord, { lng: row.lng, lat: row.lat }]));
  const reports = batch.map((feature, index) =>
    newWorksiteSchema.parse({
      id: uuidV5(`${input.emergencyId}|${layerKey}|${feature.objectId}`, OFFICIAL_IMPORT_NAMESPACE),
      locale,
      location: pointByOrd.get(index + 1) ?? null,
      workTypeKeys: [],
      contact: {
        addressText: joinFields(feature.attributes, input.addressFields, false).slice(0, ADDRESS_MAX),
        notes: joinFields(feature.attributes, input.notesFields, true).slice(0, NOTES_MAX),
      },
    }),
  );
  const result = await createWorksites(db, { emergencyId: input.emergencyId, source: "official", reports });
  if (!result.ok) throw new Error(`official import rejected: ${result.code}`);
  return result.created.length;
}

/**
 * Imports a public ArcGIS layer into an open emergency (issue #44): its polygons as the area,
 * or each parcel as a home affected and waiting for no one. Downloads first, then writes, so no
 * transaction waits on the network. Safe to run again: homes keep their ids (uuid v5 of
 * emergency, layer and object id) and existing ones are skipped. `actorId` is null for the
 * seed script. Nothing downloaded is logged; addresses only reach worksite_contacts.
 */
export async function importOfficialLayer(
  db: Database,
  actorId: string | null,
  input: OfficialLayerInput,
  {
    fetchImpl,
    lookupImpl,
    allowedHosts,
  }: { fetchImpl?: Fetch; lookupImpl?: Lookup; allowedHosts?: readonly string[] } = {},
): Promise<Result<ImportSummary>> {
  const emergency = await findOpenEmergency(db, input.emergencyId);
  if (!emergency) return { ok: false, code: "not_found" };
  if (emergency.status !== "open") return { ok: false, code: "emergency_closed" };

  let features: LayerFeature[];
  try {
    features = await fetchLayerFeatures(input.layerUrl, {
      fetchImpl,
      lookupImpl,
      allowedHosts,
      expect: input.kind === "area" ? "polygon" : "any",
    });
  } catch (error) {
    if (error instanceof LayerError) return { ok: false, code: error.code };
    throw error;
  }
  const withGeometry = features.filter((feature) => feature.geometry);
  // The normalized URL, not the typed one: "…/0?f=json" and "…/0 " are the same layer and must
  // give the same ids, or a second import would duplicate every home.
  const layerKey = parseLayerUrl(input.layerUrl, allowedHosts).href;

  let summary: ImportSummary;
  if (input.kind === "area") {
    // An empty layer would union to NULL and erase the area the emergency already has.
    if (withGeometry.length === 0) return { ok: false, code: "layer_unsupported" };
    const imported = await importArea(db, input, withGeometry);
    if (imported === 0) return { ok: false, code: "emergency_closed" };
    summary = { featureCount: withGeometry.length, createdCount: 0 };
  } else {
    // One transaction per batch, in order: a failure keeps the batches already written, and
    // running the import again picks up where it stopped.
    const importBatches = async (offset: number, created: number): Promise<number> => {
      const batch = withGeometry.slice(offset, offset + MAX_WORKSITES_PER_CALL);
      if (batch.length === 0) return created;
      const count = await importHomesBatch(db, input, layerKey, emergency.defaultLocale, batch);
      return importBatches(offset + batch.length, created + count);
    };
    summary = { featureCount: withGeometry.length, createdCount: await importBatches(0, 0) };
  }

  await logImport(db, actorId, input, summary);
  return { ok: true, data: summary };
}
