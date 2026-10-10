import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

export type EmergencyRef = { id: string; slug: string; timeZone: string; isOpen: boolean };

/** The emergency behind a URL slug, or null. */
export async function findEmergencyBySlug(db: Executor, slug: string): Promise<EmergencyRef | null> {
  const [row] = await db.execute<{ id: string; slug: string; time_zone: string; status: string }>(
    sql`SELECT id, slug, time_zone, status FROM emergencies WHERE slug = ${slug}`,
  );
  return row ? { id: row.id, slug: row.slug, timeZone: row.time_zone, isOpen: row.status === "open" } : null;
}

export type OpenEmergency = { slug: string; name: string };

/** Open emergencies, newest first, with the name in `locale` or the emergency's default. One query. */
export async function listOpenEmergencies(db: Executor, locale: string): Promise<OpenEmergency[]> {
  return db.execute<OpenEmergency>(sql`
    SELECT slug, coalesce(name ->> ${locale}, name ->> default_locale) AS name
    FROM emergencies
    WHERE status = 'open'
    ORDER BY started_at DESC
  `);
}
