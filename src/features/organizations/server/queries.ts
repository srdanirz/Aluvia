import "server-only";

import { type SQL, sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, pageOf } from "@/shared/lib/pagination";

// Each card lists its coordinators, so a page holds fewer groups than a plain list.
export const ORGANIZATIONS_PAGE_SIZE = 20;
// A group is coordinated by a few people; past this the admin sees the count, not every name.
const COORDINATORS_PER_ORGANIZATION = 50;

export type OrganizationCoordinator = { userId: string; name: string | null };

export type OrganizationSummary = {
  id: string;
  name: string;
  publicContact: string | null;
  createdAt: Date;
  coordinatorCount: number;
  coordinators: OrganizationCoordinator[];
};

/**
 * An emergency's organizations, newest first, each with its coordinators (by name). Platform
 * admins only: the caller checks. One query per page, however many groups and people.
 */
export async function listOrganizations(
  db: Executor,
  { emergencyId, after }: { emergencyId: string; after?: string },
): Promise<Page<OrganizationSummary>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db.execute<{
    id: string;
    name: string;
    public_contact: string | null;
    created_at: string;
    cursor_at: string;
    coordinator_count: number;
    coordinators: { userId: string; name: string | null }[] | null;
  }>(sql`
    SELECT o.id, o.name, o.public_contact, o.created_at, o.created_at::text AS cursor_at,
      (SELECT count(*)::int FROM emergency_members m
       WHERE m.emergency_id = o.emergency_id AND m.organization_id = o.id) AS coordinator_count,
      (SELECT json_agg(json_build_object('userId', c.user_id, 'name', c.name) ORDER BY c.name NULLS LAST, c.user_id)
       FROM (SELECT m.user_id, u.name FROM emergency_members m JOIN users u ON u.id = m.user_id
             WHERE m.emergency_id = o.emergency_id AND m.organization_id = o.id
             ORDER BY u.name NULLS LAST, m.user_id
             LIMIT ${COORDINATORS_PER_ORGANIZATION}) c) AS coordinators
    FROM organizations o
    WHERE o.emergency_id = ${emergencyId}
      ${cursor ? sql`AND (o.created_at, o.id) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : sql``}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ${ORGANIZATIONS_PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.id), ORGANIZATIONS_PAGE_SIZE);
  return {
    items: page.items.map((row) => ({
      id: row.id,
      name: row.name,
      publicContact: row.public_contact,
      createdAt: new Date(row.created_at),
      coordinatorCount: row.coordinator_count,
      coordinators: row.coordinators ?? [],
    })),
    nextCursor: page.nextCursor,
  };
}

/** One organization a home's public view names: who is attending it. */
export type AttendingOrganization = { name: string; publicContact: string | null };

/**
 * Inside a statement: the organizations whose coordinators claimed work at `worksiteId`, as a
 * json array of AttendingOrganization ordered by name, or null when none. Public by design
 * (ADR 0019): it names the group and its public contact, never the person who claimed.
 */
export function attendingOrganizationsSql(worksiteId: SQL): SQL {
  return sql`(
    SELECT json_agg(json_build_object('name', o.name, 'publicContact', o.public_contact) ORDER BY o.name, o.id)
    FROM organizations o
    WHERE o.id IN (
      SELECT m.organization_id FROM work_items wi
      JOIN emergency_members m ON m.emergency_id = wi.emergency_id AND m.user_id = wi.claimed_by
      WHERE wi.worksite_id = ${worksiteId} AND m.organization_id IS NOT NULL))`;
}
