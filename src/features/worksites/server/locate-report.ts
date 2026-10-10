import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import type { NewWorksite } from "../schemas";
import { geocodeAddress } from "./geocode-address";

/**
 * Official parcels of the emergency nobody asked help for yet whose address has the same street and
 * number as `address` (address_key, migration 0016), as long as exactly one parcel of the emergency
 * has that key: two lots sharing it (units of one building, a survey typo) would make the match a
 * guess. A report whose id is already a home (a send from before receipts existed) never matches.
 */
function parcelsMatchingAddress(emergencyId: string, reportId: string, address: string) {
  return sql`
    FROM worksites w JOIN worksite_contacts c ON c.worksite_id = w.id
    WHERE w.emergency_id = ${emergencyId}
      AND w.source = 'official'
      AND c.address_key = address_key(${address}::text)
      AND NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.worksite_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM worksites own WHERE own.id = ${reportId})
      AND (SELECT count(*) FROM worksites w2 JOIN worksite_contacts c2 ON c2.worksite_id = w2.id
        WHERE w2.emergency_id = ${emergencyId} AND w2.source = 'official'
          AND c2.address_key = address_key(${address}::text)) = 1`;
}

/**
 * The parcel the report's written address names (parcelsMatchingAddress), locked for the caller's
 * transaction with SKIP LOCKED, under the same guard as the parcel a phone's fix stands at
 * (submit-report.ts, lockNearbyParcel): two reports never both attach to one parcel.
 */
export async function lockParcelByAddress(tx: Executor, emergencyId: string, report: NewWorksite) {
  if (!report.contact.addressText) return null;
  const [row] = await tx.execute<{ id: string }>(sql`
    SELECT w.id ${parcelsMatchingAddress(emergencyId, report.id, report.contact.addressText)}
    LIMIT 1
    FOR NO KEY UPDATE OF w SKIP LOCKED`);
  return row?.id ?? null;
}

type ReportContext = {
  is_known: boolean;
  matches_parcel: boolean;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  comunas: string[];
};

/**
 * The report with the point its written address gives, when it came without one. An address that
 * names an official parcel needs no geocoder (the parcel has its point), and neither does a send
 * already recorded (a retry answers the first outcome); both skip the paid call. Otherwise the
 * Geocoding API places it near the emergency's area, or it stays without a point: the review queue
 * lists it and the `imprecise_location` flag asks a coordinator to place the pin. One query, then
 * at most one call bounded by geocodeAddress's timeout; the caller runs it before its transaction.
 */
export async function locateReport(database: Executor, emergencyId: string, report: NewWorksite) {
  const address = report.contact.addressText;
  if (report.location || !address) return report;
  const [context] = await database.execute<ReportContext>(sql`
    SELECT
      EXISTS (SELECT 1 FROM report_receipts r WHERE r.id = ${report.id})
        OR EXISTS (SELECT 1 FROM worksites own WHERE own.id = ${report.id}) AS is_known,
      EXISTS (SELECT 1 ${parcelsMatchingAddress(emergencyId, report.id, address)}) AS matches_parcel,
      ST_XMin(e.area) AS west, ST_YMin(e.area) AS south, ST_XMax(e.area) AS east, ST_YMax(e.area) AS north,
      array_to_json(e.comunas) AS comunas
    FROM emergencies e WHERE e.id = ${emergencyId}`);
  if (!context || context.is_known || context.matches_parcel) return report;

  const { west, south, east, north } = context;
  const area =
    west !== null && south !== null && east !== null && north !== null ? { west, south, east, north } : null;
  const { point } = await geocodeAddress(address, { area, comunas: context.comunas });
  return point ? { ...report, location: point, locationAccuracyMeters: null } : report;
}
