import { sql } from "drizzle-orm";

import type { Executor } from "./types";

/**
 * Every foreign key to users(id) and how the purge treats it. A table that adds one must add it
 * here and to the purge below; a test fails until it does (tests/purge.test.ts). The test sees
 * only direct keys to users: personal columns without one (worksite_contacts, admin_events
 * target ids, feedback.contact) and keys to emergency_members are this file's job to remember.
 */
export const USER_REFERENCES = {
  "admin_events.actor_id": "anonymized",
  "collection_points.created_by": "anonymized",
  "collection_points.updated_by": "anonymized",
  "contact_views.user_id": "deleted",
  "emergency_members.user_id": "deleted",
  "emergency_members.approved_by": "deleted with the row",
  "emergency_notices.published_by": "deleted with the row",
  "emergency_zones.created_by": "anonymized",
  "emergency_zones.removed_by": "anonymized",
  "invitations.created_by": "deleted with the row",
  "invitations.revoked_by": "deleted with the row",
  "notification_preferences.user_id": "deleted with the user",
  "notifications.user_id": "deleted",
  "organizations.created_by": "anonymized",
  "push_subscriptions.user_id": "deleted with the user",
  "sessions.user_id": "deleted with the user",
  "shift_signups.user_id": "deleted",
  "work_item_events.actor_id": "anonymized",
  "work_items.claimed_by": "anonymized",
  "work_items.verified_by": "anonymized",
  "worksite_updates.cancelled_by": "anonymized",
  "worksite_updates.reported_by": "anonymized",
  "worksite_assignments.assigned_by": "deleted with the members",
  "worksites.hazards_reviewed_by": "anonymized",
} as const;

export type PurgeResult =
  { ok: true; usersDeleted: number } | { ok: false; code: "emergency_open" | "emergency_not_found" };

/**
 * Deletes the personal data of a closed emergency, in one transaction (ADR 0005, SECURITY.md):
 * contacts, contact views, sign-ups, members, notifications and official notices go; every
 * person reference left in work, updates, homes and the admin log is nulled; aggregates stay
 * (how many homes, how much work, shift counts). Then the people it touched are deleted, unless
 * they are platform admins or still belong to or hold work in an open emergency.
 *
 * Callers do not assume an order of effects; the whole purge commits or nothing does. An open
 * emergency is refused: purging it would strand the people helping right now.
 */
export async function purgeEmergencyPersonalData(
  // A transaction makes the purge a savepoint of the caller's, so it commits with what the caller
  // logs about it (the admin's admin_events entry) or not at all.
  database: Executor,
  emergencyId: string,
): Promise<PurgeResult> {
  return database.transaction(async (tx) => {
    // Locks the emergency: a second purge of it waits for this one, and rows that point at it wait
    // until the purge commits. Writes to a closed emergency are the app's to refuse.
    const [emergency] = await tx.execute<{ status: string }>(
      sql`SELECT status FROM emergencies WHERE id = ${emergencyId} FOR UPDATE`,
    );
    if (!emergency) return { ok: false, code: "emergency_not_found" };
    if (emergency.status !== "closed") return { ok: false, code: "emergency_open" };

    // Everyone this emergency knows by id, collected before the rows that name them go.
    await tx.execute(sql`
      CREATE TEMP TABLE purge_people ON COMMIT DROP AS
      SELECT user_id AS id FROM emergency_members WHERE emergency_id = ${emergencyId}
      UNION SELECT approved_by FROM emergency_members WHERE emergency_id = ${emergencyId}
      UNION SELECT claimed_by FROM work_items WHERE emergency_id = ${emergencyId}
      UNION SELECT verified_by FROM work_items WHERE emergency_id = ${emergencyId}
      UNION SELECT actor_id FROM work_item_events WHERE emergency_id = ${emergencyId}
      UNION SELECT reported_by FROM worksite_updates WHERE emergency_id = ${emergencyId}
      UNION SELECT cancelled_by FROM worksite_updates WHERE emergency_id = ${emergencyId}
      UNION SELECT hazards_reviewed_by FROM worksites WHERE emergency_id = ${emergencyId}
      UNION SELECT user_id FROM contact_views WHERE emergency_id = ${emergencyId}
      UNION SELECT s.user_id FROM shift_signups s JOIN shifts sh ON sh.id = s.shift_id
        WHERE sh.emergency_id = ${emergencyId}
      UNION SELECT user_id FROM notifications WHERE emergency_id = ${emergencyId}
      UNION SELECT published_by FROM emergency_notices WHERE emergency_id = ${emergencyId}
      UNION SELECT created_by FROM invitations WHERE emergency_id = ${emergencyId}
      UNION SELECT revoked_by FROM invitations WHERE emergency_id = ${emergencyId}
      UNION SELECT target_id::uuid FROM admin_events
        WHERE emergency_id = ${emergencyId} AND target_type = 'user'
          AND target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `);

    // Anonymize first: a claim points at its claimant's membership, so members go after it.
    await tx.execute(
      sql`UPDATE work_items SET claimed_by = NULL, verified_by = NULL WHERE emergency_id = ${emergencyId}`,
    );
    await tx.execute(
      sql`UPDATE work_item_events SET actor_id = NULL, device_key = NULL, ip_key = NULL WHERE emergency_id = ${emergencyId}`,
    );
    await tx.execute(
      sql`UPDATE worksite_updates SET reported_by = NULL, cancelled_by = NULL, device_key = NULL, ip_key = NULL
        WHERE emergency_id = ${emergencyId}`,
    );
    await tx.execute(
      sql`UPDATE worksites SET hazards_reviewed_by = NULL WHERE emergency_id = ${emergencyId}`,
    );
    // Zones stay (where it was closed is history); who drew or removed them does not.
    await tx.execute(
      sql`UPDATE emergency_zones SET created_by = NULL, removed_by = NULL WHERE emergency_id = ${emergencyId}`,
    );
    // Collection points stay (where donations went is history); who edited them does not, and
    // the phone goes too in case someone typed a personal number instead of the place's own.
    await tx.execute(
      sql`UPDATE collection_points SET created_by = NULL, updated_by = NULL, phone = NULL WHERE emergency_id = ${emergencyId}`,
    );
    // Feedback sent from this emergency's pages stays (it is about the product); the way to reply goes.
    await tx.execute(sql`UPDATE feedback SET contact = NULL WHERE emergency_id = ${emergencyId}`);
    // Organizations stay (who attended is history, ADR 0019); who created them does not, and the
    // public contact goes too, in case it was a coordinator's own phone.
    await tx.execute(
      sql`UPDATE organizations SET created_by = NULL, public_contact = NULL WHERE emergency_id = ${emergencyId}`,
    );
    // The admin log keeps the action; who did it and on whom go (the trigger allows only this).
    await tx.execute(
      sql`UPDATE admin_events SET actor_id = NULL, target_id = NULL WHERE emergency_id = ${emergencyId}`,
    );

    await tx.execute(
      sql`DELETE FROM worksite_contacts WHERE worksite_id IN (SELECT id FROM worksites WHERE emergency_id = ${emergencyId})`,
    );
    await tx.execute(sql`DELETE FROM contact_views WHERE emergency_id = ${emergencyId}`);
    await tx.execute(
      sql`DELETE FROM shift_signups WHERE shift_id IN (SELECT id FROM shifts WHERE emergency_id = ${emergencyId})`,
    );
    await tx.execute(sql`DELETE FROM notifications WHERE emergency_id = ${emergencyId}`);
    // Assignments to homes go with the memberships they hang from (ON DELETE CASCADE).
    await tx.execute(sql`DELETE FROM emergency_members WHERE emergency_id = ${emergencyId}`);
    // An invitation's token hash is part of a link someone received; its homes cascade.
    await tx.execute(sql`DELETE FROM invitations WHERE emergency_id = ${emergencyId}`);
    // A notice is public, but one published by mistake may carry a personal datum (ADR 0015).
    await tx.execute(sql`DELETE FROM emergency_notices WHERE emergency_id = ${emergencyId}`);
    // Transient by design: hashed IPs and phones of public endpoints, for every emergency.
    await tx.execute(sql`DELETE FROM rate_limits`);

    // ON DELETE CASCADE takes their preferences, push endpoints, sessions and notifications; the
    // SET NULL keys anonymize what they left in other emergencies' logs.
    // Lock the candidates first, in their own statement: someone joining an open emergency right
    // now finishes before the DELETE takes its snapshot, so the check below sees their membership.
    await tx.execute(
      sql`SELECT id FROM users WHERE id IN (SELECT id FROM purge_people WHERE id IS NOT NULL) FOR UPDATE`,
    );
    const deleted = await tx.execute(sql`
      DELETE FROM users u
      WHERE u.id IN (SELECT id FROM purge_people WHERE id IS NOT NULL)
        AND u.platform_role IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM emergency_members m JOIN emergencies e ON e.id = m.emergency_id
          WHERE m.user_id = u.id AND e.status = 'open'
        )
        -- Any claim, also in a closed emergency not purged yet: a claim points at its claimant's
        -- membership, which deleting the user would cascade away. That emergency's purge frees them.
        AND NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.claimed_by = u.id)
      RETURNING u.id
    `);
    return { ok: true, usersDeleted: deleted.length };
  });
}
