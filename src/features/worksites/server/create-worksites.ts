import "server-only";

import { sql } from "drizzle-orm";

import { workItemEvents, worksiteContacts, worksites } from "@/shared/db/schema";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import { type NewWorksite, PRECISE_LOCATION_METERS, type WorksiteSource } from "../schemas";
import { DUPLICATE_RADIUS_METERS } from "./queries";

export type CreateWorksitesResult =
  { ok: true; created: string[] } | { ok: false; code: "invalid_work_type" };

export class InvalidWorkType extends Error {}

/**
 * The review flags of a new home, decided by the database in the same INSERT: a point outside
 * the emergency's area (a GPS error, swapped coordinates), a fix less precise than
 * PRECISE_LOCATION_METERS, another home of the emergency within DUPLICATE_RADIUS_METERS, or
 * someone in danger. Homes of the same batch do not see each other. An official survey import
 * gets no flags: its parcels are distinct by definition (adjacent ones sit closer than the
 * radius) and the survey, not the drawn area, is the authority on what was hit. A later report
 * next to an official home is still flagged as a possible duplicate.
 */
function reviewFlagsFor(emergencyId: string, report: NewWorksite, source: WorksiteSource) {
  if (source === "official") return sql`'{}'::worksite_review_flag[]`;
  const danger = report.isPersonInDanger ? sql`'person_in_danger'` : sql`NULL`;
  const imprecise =
    (report.locationAccuracyMeters ?? 0) > PRECISE_LOCATION_METERS ? sql`'imprecise_location'` : sql`NULL`;
  if (!report.location) return sql`array_remove(ARRAY[${danger}]::worksite_review_flag[], NULL)`;

  const point = sql`ST_SetSRID(ST_MakePoint(${report.location.lng}, ${report.location.lat}), 4326)`;
  return sql`array_remove(ARRAY[
    (SELECT 'outside_area' FROM emergencies e
      WHERE e.id = ${emergencyId} AND e.area IS NOT NULL AND NOT ST_Intersects(e.area, ${point})),
    (SELECT 'possible_duplicate' WHERE EXISTS (
      SELECT 1 FROM worksites w
      WHERE w.emergency_id = ${emergencyId}
        AND ST_DWithin(w.location::geography, ${point}::geography, ${DUPLICATE_RADIUS_METERS}))),
    ${imprecise},
    ${danger}
  ]::worksite_review_flag[], NULL)`;
}

// Postgres caps a statement at 65535 parameters; a home takes about 20 with its flags.
export const MAX_WORKSITES_PER_CALL = 500;

/**
 * Opens one unclaimed work item per (home, type) pair, with its first event. Only active types of
 * this emergency's own catalog: one missing pair throws InvalidWorkType, so the caller's
 * transaction rolls back whole. Two statements for any number of pairs.
 */
export async function insertOpenWorkItems(
  tx: Executor,
  emergencyId: string,
  pairs: readonly { id: string; key: string }[],
): Promise<void> {
  if (pairs.length === 0) return;
  const items = await tx.execute<{ id: string }>(sql`
    INSERT INTO work_items (id, emergency_id, worksite_id, work_type_key)
    SELECT gen_random_uuid(), ${emergencyId}, pair.worksite_id, pair.key
    FROM unnest(${sqlArray(
      pairs.map((p) => p.id),
      "uuid",
    )}, ${sqlArray(
      pairs.map((p) => p.key),
      "text",
    )})
      AS pair (worksite_id, key)
    JOIN work_types wt
      ON wt.emergency_id = ${emergencyId} AND wt.key = pair.key AND wt.is_active
    RETURNING id
  `);
  if (items.length !== pairs.length) throw new InvalidWorkType();
  await tx
    .insert(workItemEvents)
    .values(items.map((item) => ({ workItemId: item.id, emergencyId, toStatus: "open_unclaimed" as const })));
}

/**
 * Creates homes with their work items, events and contact in one transaction (a savepoint when
 * `database` is already a transaction): all of them or none. Up to MAX_WORKSITES_PER_CALL homes
 * cost the same four statements. A home may come with no work types (an official survey
 * import): it is recorded as affected and not waiting for anyone. Idempotent by the client-generated
 * id: a home that already exists is skipped and left untouched, and `created` lists only the new
 * ids. Callers answer success for a skipped id without reading that home back (STYLEGUIDE,
 * Concurrencia): its id is public, its data is not.
 *
 * Trusted arguments (`source`) come from the caller's policy, never from the request body.
 */
export async function createWorksites(
  database: Executor,
  {
    emergencyId,
    source,
    reports,
  }: { emergencyId: string; source: WorksiteSource; reports: readonly NewWorksite[] },
): Promise<CreateWorksitesResult> {
  if (reports.length === 0) return { ok: true, created: [] };
  if (reports.length > MAX_WORKSITES_PER_CALL) {
    throw new RangeError(`createWorksites takes at most ${MAX_WORKSITES_PER_CALL} homes per call`);
  }
  try {
    const created = await database.transaction(async (tx) => {
      const inserted = await tx
        .insert(worksites)
        .values(
          reports.map((report) => ({
            id: report.id,
            emergencyId,
            location: report.location ? { x: report.location.lng, y: report.location.lat } : null,
            damageLevel: report.damageLevel,
            hasVulnerablePeople: report.hasVulnerablePeople,
            hazards: report.hazards,
            reviewFlags: reviewFlagsFor(emergencyId, report, source),
            source,
            // Every work item starts open and unclaimed, so the home starts waiting now (ADR 0005);
            // a home without work (an official survey import) is not waiting for anyone.
            unclaimedSince: report.workTypeKeys.length > 0 ? sql`now()` : null,
          })),
        )
        .onConflictDoNothing({ target: worksites.id })
        .returning({ id: worksites.id });
      if (inserted.length === 0) return [];

      const fresh = new Set(inserted.map((row) => row.id));
      const pending = reports.filter((report) => fresh.has(report.id));
      const pairs = pending.flatMap((report) => report.workTypeKeys.map((key) => ({ id: report.id, key })));

      await insertOpenWorkItems(tx, emergencyId, pairs);

      const contacts = pending.filter(({ contact }) =>
        Object.values(contact).some((value) => value !== null),
      );
      if (contacts.length > 0) {
        await tx.insert(worksiteContacts).values(
          contacts.map(({ id, locale, contact }) => ({
            worksiteId: id,
            ...contact,
            locale,
            notifyConsentAt: contact.notifyChannel ? sql`now()` : null,
          })),
        );
      }
      return [...fresh];
    });
    return { ok: true, created };
  } catch (error) {
    if (error instanceof InvalidWorkType) return { ok: false, code: "invalid_work_type" };
    throw error;
  }
}
