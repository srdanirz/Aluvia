import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { reportReceipts, worksiteContacts } from "@/shared/db/schema";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import { type NewWorksite, PRECISE_LOCATION_METERS, type WorksiteSource } from "../schemas";
import { createWorksites, insertOpenWorkItems, InvalidWorkType } from "./create-worksites";
import { DUPLICATE_RADIUS_METERS } from "./queries";

// An official parcel is a lot of the survey layer; a phone standing at the door of a ~10 m wide
// lot reads within this of the parcel's point, and the next lot's point is usually farther.
export const PARCEL_ATTACH_RADIUS_METERS = 20;

/** Who can send a report through the form; never `official`, which marks an unclaimed parcel. */
export type ReportSource = Extract<WorksiteSource, "neighbor" | "coordinator">;

export type SubmitReportResult =
  | { ok: true; worksiteId: string; outcome: "created" | "attached" | "retry" }
  | { ok: false; code: "invalid_work_type" };

// A concurrent send of the same report recorded its receipt first; this one rolls back.
class ReceiptTaken extends Error {}

async function findReceipt(database: Executor, emergencyId: string, reportId: string) {
  const [row] = await database
    .select({ worksiteId: reportReceipts.worksiteId })
    .from(reportReceipts)
    .where(and(eq(reportReceipts.id, reportId), eq(reportReceipts.emergencyId, emergencyId)));
  return row?.worksiteId ?? null;
}

/**
 * The nearest official parcel within PARCEL_ATTACH_RADIUS_METERS that nobody asked help for yet,
 * locked for this transaction. SKIP LOCKED: a parcel another report is attaching to right now is
 * passed over, so two reports never both attach. The guard after that one commits is the
 * `source = 'official'` column, not the work_items subquery: a row locked right after a commit is
 * rechecked on its own columns, while the subquery keeps the old snapshot. That is why a report
 * can never carry the `official` source (ReportSource). Imprecise fixes do not attach: the point may sit
 * on another block. Neither does a report whose id is already a home (a send from before
 * receipts existed): it is a retry of a report that created its own home.
 */
async function lockNearbyParcel(tx: Executor, emergencyId: string, report: NewWorksite) {
  if (!report.location || (report.locationAccuracyMeters ?? 0) > PRECISE_LOCATION_METERS) return null;
  const point = sql`ST_SetSRID(ST_MakePoint(${report.location.lng}, ${report.location.lat}), 4326)::geography`;
  const [row] = await tx.execute<{ id: string }>(sql`
    SELECT w.id FROM worksites w
    WHERE w.emergency_id = ${emergencyId}
      AND w.source = 'official'
      AND ST_DWithin(w.location::geography, ${point}, ${PARCEL_ATTACH_RADIUS_METERS})
      AND NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.worksite_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM worksites own WHERE own.id = ${report.id})
    ORDER BY ST_Distance(w.location::geography, ${point}), w.id
    LIMIT 1
    FOR NO KEY UPDATE OF w SKIP LOCKED`);
  return row?.id ?? null;
}

/**
 * Turns a locked official parcel into the reported home: the report's work, the reporter's source
 * and contact, the same bookkeeping a new home gets. The parcel keeps its point and its official
 * address unless it had none; the reporter's name, phone, notes and consent are stored when given.
 */
async function attachReport(
  tx: Executor,
  {
    emergencyId,
    source,
    parcelId,
    report,
  }: {
    emergencyId: string;
    source: ReportSource;
    parcelId: string;
    report: NewWorksite;
  },
) {
  await insertOpenWorkItems(
    tx,
    emergencyId,
    report.workTypeKeys.map((key) => ({ id: parcelId, key })),
  );

  const { contact } = report;
  if (Object.values(contact).some((value) => value !== null)) {
    await tx
      .insert(worksiteContacts)
      .values({
        worksiteId: parcelId,
        ...contact,
        locale: report.locale,
        notifyConsentAt: contact.notifyChannel ? sql`now()` : null,
      })
      .onConflictDoUpdate({
        target: worksiteContacts.worksiteId,
        set: {
          name: sql`coalesce(excluded.name, ${worksiteContacts.name})`,
          addressText: sql`coalesce(${worksiteContacts.addressText}, excluded.address_text)`,
          notes: sql`coalesce(excluded.notes, ${worksiteContacts.notes})`,
          // A consent belongs to its phone, and so does the language its notices go out in: a new
          // phone brings its own choice, even "none".
          locale: sql`CASE WHEN excluded.phone IS NULL THEN coalesce(${worksiteContacts.locale}, excluded.locale) ELSE excluded.locale END`,
          phone: sql`coalesce(excluded.phone, ${worksiteContacts.phone})`,
          notifyChannel: sql`CASE WHEN excluded.phone IS NULL THEN ${worksiteContacts.notifyChannel} ELSE excluded.notify_channel END`,
          notifyConsentAt: sql`CASE WHEN excluded.phone IS NULL THEN ${worksiteContacts.notifyConsentAt} ELSE excluded.notify_consent_at END`,
        },
      });
  }

  const hazards = sql`${sqlArray(report.hazards, "text")}::worksite_hazard[]`;
  // The parcel had no work (the lock's condition), so new work starts it waiting now, as for a new home.
  await tx.execute(sql`
    UPDATE worksites SET
      source = ${source},
      damage_level = coalesce(${report.damageLevel}::damage_level, damage_level),
      has_vulnerable_people = has_vulnerable_people OR ${report.hasVulnerablePeople}::boolean,
      hazards = ARRAY(SELECT DISTINCT unnest(hazards || ${hazards}) ORDER BY 1),
      hazards_reviewed_at = CASE WHEN ${hazards} <@ hazards THEN hazards_reviewed_at END,
      hazards_reviewed_by = CASE WHEN ${hazards} <@ hazards THEN hazards_reviewed_by END,
      -- The import skipped duplicate checks (parcels are distinct); a reported home is checked like a new one.
      review_flags = ARRAY(SELECT DISTINCT unnest(review_flags || array_remove(ARRAY[
        CASE WHEN ${report.isPersonInDanger}::boolean THEN 'person_in_danger' END,
        (SELECT 'possible_duplicate' WHERE EXISTS (
          SELECT 1 FROM worksites other
          WHERE other.emergency_id = worksites.emergency_id AND other.id <> worksites.id
            AND other.source <> 'official'
            AND ST_DWithin(other.location::geography, worksites.location::geography, ${DUPLICATE_RADIUS_METERS})))
      ]::worksite_review_flag[], NULL)) ORDER BY 1),
      unclaimed_since = CASE WHEN ${report.workTypeKeys.length > 0}::boolean THEN coalesce(unclaimed_since, now()) END,
      version = version + 1,
      updated_at = now()
    WHERE id = ${parcelId}`);
}

/**
 * One report from the form or the outbox. Near an official parcel nobody asked help for yet, the
 * report attaches to it; otherwise it creates its own home (createWorksites). Idempotent by the
 * report's client-generated id: report_receipts records where it ended, so every later send of
 * the same id answers the same home and writes nothing. The receipt's primary key decides between
 * two sends in flight at once: the second waits for the first and rolls back its own writes.
 *
 * A send whose id is already a home without a receipt (sent before receipts existed, or someone
 * else's public id) answers that id and changes nothing, as before; it never reads that home.
 * Trusted arguments (`source`) come from the caller's policy, never from the request body.
 */
export async function submitWorksiteReport(
  database: Executor,
  { emergencyId, source, report }: { emergencyId: string; source: ReportSource; report: NewWorksite },
): Promise<SubmitReportResult> {
  try {
    return await database.transaction(async (tx): Promise<SubmitReportResult> => {
      const recorded = await findReceipt(tx, emergencyId, report.id);
      if (recorded) return { ok: true, worksiteId: recorded, outcome: "retry" };

      const parcelId = await lockNearbyParcel(tx, emergencyId, report);
      if (parcelId) {
        await attachReport(tx, { emergencyId, source, parcelId, report });
      } else {
        const created = await createWorksites(tx, { emergencyId, source, reports: [report] });
        if (!created.ok) throw new InvalidWorkType();
        if (created.created.length === 0) return { ok: true, worksiteId: report.id, outcome: "retry" };
      }

      const worksiteId = parcelId ?? report.id;
      const receipt = await tx
        .insert(reportReceipts)
        .values({ id: report.id, emergencyId, worksiteId })
        .onConflictDoNothing({ target: reportReceipts.id })
        .returning({ id: reportReceipts.id });
      if (receipt.length === 0) throw new ReceiptTaken();
      return { ok: true, worksiteId, outcome: parcelId ? "attached" : "created" };
    });
  } catch (error) {
    if (error instanceof InvalidWorkType) return { ok: false, code: "invalid_work_type" };
    if (!(error instanceof ReceiptTaken)) throw error;
    // The winner committed before our insert returned, so its receipt is visible now.
    // A receipt of another emergency under this id is not ours to read: answer the id, as before.
    const worksiteId = await findReceipt(database, emergencyId, report.id);
    return { ok: true, worksiteId: worksiteId ?? report.id, outcome: "retry" };
  }
}
