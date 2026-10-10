import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Executor } from "@/shared/db/types";

import type { AttentionLevel } from "@/features/map/attention";
import { attentionLevelSql, isOpenWorkItemSql, staleBeforeSql } from "@/features/map/server/attention-level";
import { streetWithoutNumberSql } from "@/features/map/server/street";

/**
 * The reported homes of an emergency, where help is most needed first. The order is decided in
 * SQL, in this precedence:
 * 1. someone in danger or a hazard nobody reviewed yet;
 * 2. more reports of the same home (one per report_receipts row; a home that came from a batch
 *    or the API before receipts existed counts as one report);
 * 3. more open work nobody has taken;
 * 4. waiting longer: `unclaimed_since`, homes with nothing waiting after, then `created_at`.
 * Official parcels nobody asked about are left out, as on the map.
 *
 * Everyone gets the street without number. `contactViewerId` is set only by a caller whose policy
 * lets that person see contacts (coordinator, platform admin): the rows then carry the written
 * address and every shown address is logged in contact_views by the same statement. One query
 * per page, whatever its size and whoever looks.
 */

export const REPORTS_PAGE_SIZE = 20;

export type ReportedWorksite = {
  id: string;
  level: AttentionLevel;
  /** Street without number; the public reading of the address. */
  street: string | null;
  /** The written address, only for a contact viewer; always null for the public. */
  addressText: string | null;
  reportCount: number;
  /** Names of the open work types, catalog order, no repeats. */
  needs: string[];
  /** Since when its open work waits for someone, or when it was reported if nothing waits. */
  waitingSince: Date;
};

export type ReportedWorksitesPage = { items: ReportedWorksite[]; nextCursor: string | null };

type Row = {
  id: string;
  level: AttentionLevel;
  street: string | null;
  address_text: string | null;
  report_count: number;
  needs: string[] | null;
  waiting_since: string;
  flag_key: number;
  open_unclaimed: number;
  waiting_key: string;
  created_key: string;
};

// The sort key of the last row shown. Timestamps travel as the text the query printed (UTC with
// microseconds): a JS Date drops the microseconds and the next page would repeat rows.
// Strict shapes, not Date.parse: V8 accepts "1" or "May 2", Postgres rejects them, and a forged
// cursor must read as the first page, never fail. Counts stay inside Postgres int.
const printedTimestamp = z.iso.datetime({ precision: 6 });
const pgInt = z.int().min(0).max(2_147_483_647);
const cursorSchema = z.strictObject({
  flag: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reports: pgInt,
  open: pgInt,
  waiting: z.union([z.literal("infinity"), printedTimestamp]),
  created: printedTimestamp,
  id: z.uuid(),
});
type Cursor = z.infer<typeof cursorSchema>;

function encodeCursor(row: Row): string {
  const cursor: Cursor = {
    flag: row.flag_key === 0 ? 0 : row.flag_key === 1 ? 1 : 2,
    reports: row.report_count,
    open: row.open_unclaimed,
    waiting: row.waiting_key,
    created: row.created_key,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** The cursor comes back from the browser: anything malformed reads as "from the start". */
function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not base64url JSON: a hand-edited or truncated link, read as the first page.
    return null;
  }
}

const utcText = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

export async function listReportedWorksites(
  database: Executor,
  {
    emergencyId,
    locale,
    now,
    cursor,
    contactViewerId,
  }: {
    emergencyId: string;
    locale: string;
    now: Date;
    cursor: string | null;
    contactViewerId: string | null;
  },
): Promise<ReportedWorksitesPage> {
  const after = cursor ? decodeCursor(cursor) : null;
  // Counts sort descending, so the key negates them and the whole tuple sorts ascending: one row
  // comparison then resumes after the last row shown.
  const resume = after
    ? sql`WHERE (flag_key, -report_count, -open_unclaimed, waiting_at, created_at, id) >
        (${after.flag}::int, ${-after.reports}::int, ${-after.open}::int,
         ${after.waiting}::timestamptz, ${after.created}::timestamptz, ${after.id}::uuid)`
    : sql``;
  const showAddress = contactViewerId !== null;

  const rows = await database.execute<Row>(sql`
    WITH home AS (
      SELECT
        w.id,
        w.created_at,
        ${attentionLevelSql(staleBeforeSql(now))} AS level,
        -- 0: someone in danger or an unreviewed hazard; 2: attended, so it sinks below every home
        -- still waiting however many neighbors reported it; 1: everything else.
        CASE WHEN (cardinality(w.hazards) > 0 AND w.hazards_reviewed_at IS NULL)
          OR 'person_in_danger' = ANY(w.review_flags) THEN 0
          WHEN ${attentionLevelSql(staleBeforeSql(now))} = 'attended' THEN 2
          ELSE 1 END AS flag_key,
        greatest(
          (SELECT count(*) FROM report_receipts r WHERE r.worksite_id = w.id),
          (w.source <> 'official')::int
        )::int AS report_count,
        (count(wi.id) FILTER (WHERE ${isOpenWorkItemSql} AND wi.claimed_by IS NULL))::int AS open_unclaimed,
        coalesce(w.unclaimed_since, 'infinity'::timestamptz) AS waiting_at,
        coalesce(w.unclaimed_since, w.created_at) AS waiting_since,
        -- to_json: the driver parses json, not text[].
        to_json(array_agg(coalesce(wt.name ->> ${locale}, wt.name ->> e.default_locale, wt.key)
          ORDER BY wt.sort_order, wt.key) FILTER (WHERE ${isOpenWorkItemSql})) AS needs,
        w.source
      FROM worksites w
      JOIN emergencies e ON e.id = w.emergency_id
      LEFT JOIN emergency_settings es ON es.emergency_id = e.id
      LEFT JOIN work_items wi ON wi.worksite_id = w.id AND wi.emergency_id = w.emergency_id
      LEFT JOIN work_types wt ON wt.emergency_id = wi.emergency_id AND wt.key = wi.work_type_key
      WHERE w.emergency_id = ${emergencyId}
      GROUP BY w.id, e.id, es.emergency_id
    ),
    listed AS (
      -- Imported official parcels nobody asked about: the same rule that keeps them off the map.
      SELECT * FROM home WHERE NOT (source = 'official' AND level = 'no_request')
    ),
    page AS (
      SELECT
        l.*,
        row_number() OVER (
          ORDER BY flag_key, -report_count, -open_unclaimed, waiting_at, created_at, id
        ) AS row_index,
        ${streetWithoutNumberSql(sql`c.address_text`)} AS street,
        ${showAddress ? sql`c.address_text` : sql`NULL::text`} AS address_text
      FROM listed l
      LEFT JOIN worksite_contacts c ON c.worksite_id = l.id
      ${resume}
      ORDER BY flag_key, -report_count, -open_unclaimed, waiting_at, created_at, id
      LIMIT ${REPORTS_PAGE_SIZE + 1}
    )${
      showAddress
        ? sql`,
    logged AS (
      INSERT INTO contact_views (emergency_id, user_id, worksite_id)
      SELECT ${emergencyId}::uuid, ${contactViewerId}::uuid, id
      FROM page
      WHERE address_text IS NOT NULL AND row_index <= ${REPORTS_PAGE_SIZE}
    )`
        : sql``
    }
    SELECT
      id, level, street, address_text, report_count, needs, flag_key, open_unclaimed,
      ${utcText("waiting_since")} AS waiting_since,
      CASE WHEN waiting_at = 'infinity' THEN 'infinity' ELSE ${utcText("waiting_at")} END AS waiting_key,
      ${utcText("created_at")} AS created_key
    FROM page
    ORDER BY row_index
  `);

  const page = rows.slice(0, REPORTS_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      level: row.level,
      street: row.street,
      addressText: row.address_text,
      reportCount: row.report_count,
      needs: [...new Set(row.needs ?? [])],
      waitingSince: new Date(row.waiting_since),
    })),
    nextCursor: rows.length > REPORTS_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}
