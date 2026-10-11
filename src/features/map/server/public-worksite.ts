import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/shared/db/client";
import type { damageLevel, worksiteHazard } from "@/shared/db/schema/enums";
import type { Executor } from "@/shared/db/types";
import { type AttendingOrganization, attendingOrganizationsSql } from "@/features/organizations/server";

import type { AttentionLevel, WorkItemStatus } from "../attention";
import { attentionLevelSql, isOpenWorkItemSql, lastActivitySql, staleBeforeSql } from "./attention-level";
import { publicAddressSql, publicContactSql } from "./public-address";

type DamageLevel = (typeof damageLevel.enumValues)[number];
type Hazard = (typeof worksiteHazard.enumValues)[number];

export type PublicWorksite = {
  id: string;
  emergencyId: string;
  emergencyName: string;
  /** IANA zone of the emergency; dates are shown in it (STYLEGUIDE, Datos). */
  timeZone: string;
  /** The point the reporter confirmed (ADR 0011: public, so volunteers reach the door); null while
   * the home has only a written address and nobody placed its pin. */
  position: { lat: number; lng: number } | null;
  /** Reported risks; while unreviewed the home is `do_not_enter`. */
  hazards: Hazard[];
  level: AttentionLevel;
  damageLevel: DamageLevel | null;
  reportedAt: Date;
  /** Last time anyone touched the home or its work. */
  updatedAt: Date;
  workItems: { workType: string; status: WorkItemStatus }[];
  /** People who took its open work: how many are going, never who. */
  volunteerCount: number;
  /** People working there by the newest field update (worksite_updates); null without one. */
  peoplePresent: number | null;
  /** Since when its open work waits for someone, or when it was reported if nothing waits. */
  waitingSince: Date;
  /** The written address with its number, so a volunteer finds the door (ADR 0017). */
  address: string | null;
  /** Name and phone, only when the reporter chose to show them (ADR 0017); null otherwise. */
  contactName: string | null;
  contactPhone: string | null;
  /** Organizations whose coordinators claimed its work (ADR 0019): "Atiende: ...". */
  organizations: AttendingOrganization[];
};

type WorksiteRow = {
  id: string;
  emergency_id: string;
  emergency_name: string;
  time_zone: string;
  lat: number | null;
  lng: number | null;
  hazards: Hazard[];
  level: AttentionLevel;
  damage_level: DamageLevel | null;
  created_at: Date | string;
  updated_at: Date | string;
  work_items: { workType: string; status: WorkItemStatus }[] | null;
  volunteer_count: number;
  people_present: number | null;
  waiting_since: Date | string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  organizations: AttendingOrganization[] | null;
};

/**
 * The public form of a home (STYLEGUIDE, Datos personales): point, attention level, damage, work
 * and the written address. Name and phone only when the reporter opted in (ADR 0017); never
 * notes, vulnerability or who claimed what. Null if the id is not a home of this emergency.
 */
export async function findPublicWorksite(
  { slug, id, locale, now }: { slug: string; id: string; locale: string; now: Date },
  database: Executor = db,
): Promise<PublicWorksite | null> {
  const [row] = await database.execute<WorksiteRow>(sql`
    SELECT
      w.id,
      w.emergency_id,
      coalesce(e.name ->> ${locale}, e.name ->> e.default_locale) AS emergency_name,
      e.time_zone,
      ST_Y(w.location) AS lat,
      ST_X(w.location) AS lng,
      w.hazards,
      ${attentionLevelSql(staleBeforeSql(now))} AS level,
      w.damage_level,
      w.created_at,
      ${lastActivitySql} AS updated_at,
      json_agg(
        json_build_object(
          'workType', coalesce(wt.name ->> ${locale}, wt.name ->> e.default_locale, wt.key),
          'status', wi.status
        )
        ORDER BY wt.sort_order, wt.key, wi.id
      ) FILTER (WHERE wi.id IS NOT NULL) AS work_items,
      (count(DISTINCT wi.claimed_by) FILTER (WHERE ${isOpenWorkItemSql}))::int AS volunteer_count,
      u.people_present,
      coalesce(w.unclaimed_since, w.created_at) AS waiting_since,
      ${publicAddressSql(sql`c.address_text`)} AS address,
      ${publicContactSql("c", "name")} AS contact_name,
      ${publicContactSql("c", "phone")} AS contact_phone,
      ${attendingOrganizationsSql(sql`w.id`)} AS organizations
    FROM worksites w
    LEFT JOIN worksite_contacts c ON c.worksite_id = w.id
    JOIN emergencies e ON e.id = w.emergency_id
    LEFT JOIN emergency_settings es ON es.emergency_id = e.id
    LEFT JOIN work_items wi ON wi.worksite_id = w.id AND wi.emergency_id = w.emergency_id
    LEFT JOIN work_types wt ON wt.emergency_id = wi.emergency_id AND wt.key = wi.work_type_key
    -- The newest live field update; one home, so one index probe (worksite_id, created_at DESC).
    LEFT JOIN LATERAL (
      SELECT wu.people_present FROM worksite_updates wu
      WHERE wu.worksite_id = w.id AND wu.cancelled_at IS NULL
      ORDER BY wu.created_at DESC LIMIT 1
    ) u ON true
    WHERE e.slug = ${slug} AND w.id = ${id}
    GROUP BY w.id, e.id, es.emergency_id, c.worksite_id, u.people_present
  `);
  if (!row) return null;
  return {
    id: row.id,
    emergencyId: row.emergency_id,
    emergencyName: row.emergency_name,
    timeZone: row.time_zone,
    position: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
    hazards: row.hazards,
    level: row.level,
    damageLevel: row.damage_level,
    reportedAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    workItems: row.work_items ?? [],
    volunteerCount: row.volunteer_count,
    peoplePresent: row.people_present,
    waitingSince: new Date(row.waiting_since),
    address: row.address,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    organizations: row.organizations ?? [],
  };
}
