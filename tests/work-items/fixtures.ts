import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import {
  disasterTypes,
  emergencies,
  emergencyMembers,
  emergencySettings,
  shifts,
  users,
  workItems,
  workTypes,
  worksiteContacts,
  worksites,
} from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";

// Invented data only (SECURITY.md): no real names, phones or places.
export const NOW = new Date("2026-10-10T12:00:00Z");

export async function createEmergency(db: Database, { holdMinutes }: { holdMinutes?: number } = {}) {
  await db
    .insert(disasterTypes)
    .values({ key: "test_work_cycle", name: { es: "Prueba" } })
    .onConflictDoNothing();
  const [emergency] = await db
    .insert(emergencies)
    .values({
      slug: `test-${randomUUID()}`,
      disasterTypeKey: "test_work_cycle",
      name: { es: "Emergencia de prueba" },
      defaultLocale: "es",
      timeZone: "America/Santiago",
      startedAt: NOW,
    })
    .returning({ id: emergencies.id, slug: emergencies.slug });
  if (!emergency) throw new Error("emergency not created");
  await db.insert(workTypes).values([
    { emergencyId: emergency.id, key: "mud", name: { es: "Barro", en: "Mud" }, sortOrder: 1 },
    { emergencyId: emergency.id, key: "debris", name: { es: "Escombros" }, sortOrder: 2 },
  ]);
  if (holdMinutes)
    await db.insert(emergencySettings).values({ emergencyId: emergency.id, claimHoldMinutes: holdMinutes });
  return emergency;
}

export async function createUsers(
  db: Database,
  emergencyId: string,
  n: number,
  role: "volunteer" | "coordinator" | null = "volunteer",
) {
  const rows = await db
    .insert(users)
    .values(Array.from({ length: n }, (_, i) => ({ name: `Persona ${i}` })))
    .returning({ id: users.id });
  if (role) {
    await db.insert(emergencyMembers).values(
      rows.map(({ id }) => ({
        emergencyId,
        userId: id,
        role,
        // Approved by nobody in particular; only elevated roles need it on feat/auth.
        approvedAt: role === "coordinator" ? NOW : null,
      })),
    );
  }
  return rows.map((r) => r.id);
}

/** A home with one open, unclaimed work item per key, waiting since `unclaimedSince`. */
export async function createWorksite(
  db: Database,
  emergencyId: string,
  {
    keys = ["mud"],
    unclaimedSince = NOW,
    location = { x: -70.55, y: -33.41 },
    neighborChannel,
  }: {
    keys?: string[];
    unclaimedSince?: Date | null;
    location?: { x: number; y: number };
    neighborChannel?: "sms" | "whatsapp";
  } = {},
) {
  const id = randomUUID();
  await db.insert(worksites).values({ id, emergencyId, location, source: "neighbor", unclaimedSince });
  const items = keys.map((key) => ({ id: randomUUID(), emergencyId, worksiteId: id, workTypeKey: key }));
  if (items.length > 0) await db.insert(workItems).values(items);
  if (neighborChannel) {
    await db.insert(worksiteContacts).values({
      worksiteId: id,
      phone: "+56900000000",
      notifyChannel: neighborChannel,
      notifyConsentAt: NOW,
    });
  }
  return { worksiteId: id, workItemIds: items.map((i) => i.id) };
}

export async function createShift(
  db: Database,
  emergencyId: string,
  {
    capacity = 3,
    startsAt = new Date(NOW.getTime() + 24 * 3600_000),
  }: { capacity?: number; startsAt?: Date } = {},
) {
  const [shift] = await db
    .insert(shifts)
    .values({
      emergencyId,
      meetingPoint: "Plaza de prueba",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 4 * 3600_000),
      capacity,
    })
    .returning({ id: shifts.id });
  if (!shift) throw new Error("shift not created");
  return shift.id;
}

/** Outbox rows of one event, by its exact key. */
export async function outboxFor(db: Database, eventKey: string) {
  return db.execute<{
    event_key: string;
    user_id: string | null;
    worksite_id: string | null;
    not_before: string;
    cancelled_at: string | null;
  }>(
    sql`SELECT event_key, user_id, worksite_id, not_before, cancelled_at FROM notifications WHERE event_key = ${eventKey}`,
  );
}
