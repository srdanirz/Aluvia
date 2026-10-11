import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { purgeEmergencyPersonalData, USER_REFERENCES } from "@/shared/db/purge";
import {
  adminEvents,
  contactViews,
  disasterTypes,
  emergencies,
  emergencyMembers,
  emergencyNotices,
  feedback,
  invitations,
  notificationPreferences,
  notifications,
  rateLimits,
  sessions,
  shiftSignups,
  shifts,
  users,
  workItemEvents,
  workItems,
  workTypes,
  worksiteContacts,
  worksites,
  worksiteUpdates,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";

const { db, close } = createTestDb();
afterAll(close);

const NOW = new Date("2026-10-10T12:00:00Z");
// Invented coordinates in open ocean, far from any real address (SECURITY.md).
const POINT = { x: -82.3, y: -42.1 };

async function createEmergency(slug: string, status: "open" | "closed") {
  const [row] = await db
    .insert(emergencies)
    .values({
      slug,
      disasterTypeKey: "test_purge_flood",
      name: { es: slug },
      defaultLocale: "es",
      timeZone: "America/Santiago",
      startedAt: NOW,
      status,
      closedAt: status === "closed" ? NOW : null,
    })
    .returning({ id: emergencies.id });
  if (!row) throw new Error("emergency not created");
  await db.insert(workTypes).values({ emergencyId: row.id, key: "mud", name: { es: "Barro" } });
  return row.id;
}

async function createUser(name: string, platformRole: "admin" | null = null) {
  const [row] = await db.insert(users).values({ name, platformRole }).returning({ id: users.id });
  if (!row) throw new Error("user not created");
  return row.id;
}

/** One home with contact, a claimed work item and its event, a count update, a sign-up and a notice. */
async function seedEmergency(
  emergencyId: string,
  people: { volunteer: string; coordinator: string; admin: string },
) {
  const worksiteId = randomUUID();
  await db.insert(emergencyMembers).values([
    { emergencyId, userId: people.volunteer },
    {
      emergencyId,
      userId: people.coordinator,
      role: "coordinator",
      approvedAt: NOW,
      approvedBy: people.admin,
    },
  ]);
  await db.insert(worksites).values({
    id: worksiteId,
    emergencyId,
    location: POINT,
    source: "neighbor",
    hazards: ["gas"],
    hazardsReviewedAt: NOW,
    hazardsReviewedBy: people.coordinator,
  });
  await db.insert(worksiteContacts).values({
    worksiteId,
    name: "Nombre inventado",
    phone: "+56900000001",
    addressText: "Calle inventada 1",
  });
  await db.insert(contactViews).values({ emergencyId, worksiteId, userId: people.coordinator });
  const workItemId = randomUUID();
  await db.insert(workItems).values({
    id: workItemId,
    emergencyId,
    worksiteId,
    workTypeKey: "mud",
    status: "open_claimed",
    claimedBy: people.volunteer,
    verifiedAt: NOW,
    verifiedBy: people.coordinator,
  });
  await db.insert(workItemEvents).values({
    workItemId,
    emergencyId,
    toStatus: "open_claimed",
    actorId: people.volunteer,
  });
  await db.insert(worksiteUpdates).values({
    id: randomUUID(),
    emergencyId,
    worksiteId,
    peoplePresent: 3,
    reportedBy: people.volunteer,
    cancelledAt: NOW,
    cancelledBy: people.coordinator,
  });
  const [shift] = await db
    .insert(shifts)
    .values({
      emergencyId,
      meetingPoint: "Punto inventado",
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
      capacity: 5,
      filled: 1,
    })
    .returning({ id: shifts.id });
  if (!shift) throw new Error("shift not created");
  await db.insert(shiftSignups).values({ shiftId: shift.id, userId: people.volunteer });
  await db.insert(notifications).values({
    emergencyId,
    eventKey: `test-${worksiteId}`,
    type: "test",
    userId: people.volunteer,
    channel: "push",
    level: "normal",
  });
  await db.insert(emergencyNotices).values({
    emergencyId,
    message: { es: "Aviso con un dato personal por error" },
    publishedBy: people.admin,
  });
  await db.insert(adminEvents).values({
    actorId: people.admin,
    action: "test_action",
    targetType: "user",
    targetId: people.coordinator,
    emergencyId,
  });
  await db.insert(invitations).values({
    emergencyId,
    tokenHash: `hash-${worksiteId}`,
    role: "volunteer",
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    createdBy: people.coordinator,
  });
  await db.insert(feedback).values({
    emergencyId,
    category: "problem",
    message: "Comentario inventado",
    contact: "correo@ejemplo.invalid",
  });
  return { worksiteId, workItemId };
}

const count = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;

let closedId: string;
let openId: string;
let people: {
  volunteer: string;
  coordinator: string;
  admin: string;
  stillHelping: string;
  claimsElsewhere: string;
};
let seeded: { worksiteId: string; workItemId: string };

beforeAll(async () => {
  await db.insert(disasterTypes).values({ key: "test_purge_flood", name: { es: "Prueba" } });
  closedId = await createEmergency("purge-closed", "closed");
  openId = await createEmergency("purge-open", "open");
  people = {
    volunteer: await createUser("Voluntaria inventada"),
    coordinator: await createUser("Coordinador inventado"),
    admin: await createUser("Admin inventada", "admin"),
    stillHelping: await createUser("Voluntario de otra emergencia"),
    claimsElsewhere: await createUser("Voluntaria con un trabajo en otra emergencia cerrada"),
  };
  seeded = await seedEmergency(closedId, people);
  // Someone who also helps in an open emergency keeps their account.
  await db.insert(emergencyMembers).values([
    { emergencyId: closedId, userId: people.stillHelping },
    { emergencyId: openId, userId: people.stillHelping },
  ]);
  // Someone with a claim in another closed emergency, not purged yet: deleting them now would
  // cascade away the membership their claim points at.
  const otherClosedId = await createEmergency("purge-other-closed", "closed");
  await db.insert(emergencyMembers).values([
    { emergencyId: closedId, userId: people.claimsElsewhere },
    { emergencyId: otherClosedId, userId: people.claimsElsewhere },
  ]);
  const otherHome = randomUUID();
  await db
    .insert(worksites)
    .values({ id: otherHome, emergencyId: otherClosedId, location: POINT, source: "neighbor" });
  await db.insert(workItems).values({
    id: randomUUID(),
    emergencyId: otherClosedId,
    worksiteId: otherHome,
    workTypeKey: "mud",
    status: "open_claimed",
    claimedBy: people.claimsElsewhere,
  });
  await db.insert(notificationPreferences).values({ userId: people.volunteer });
  await db.insert(sessions).values({
    id: `session-${people.volunteer}`,
    userId: people.volunteer,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
  });
  await db.insert(rateLimits).values({ key: "report:ip:hash", hits: 1, windowStartedAt: NOW });
});

describe("purgeEmergencyPersonalData", () => {
  it("refuses an emergency that is still open", async () => {
    expect(await purgeEmergencyPersonalData(db, openId)).toEqual({ ok: false, code: "emergency_open" });
  });

  it("deletes and anonymizes every person in a closed emergency, and keeps the aggregates", async () => {
    const result = await purgeEmergencyPersonalData(db, closedId);
    expect(result).toEqual({ ok: true, usersDeleted: 2 });

    const byEmergency = (table: { emergencyId: unknown }) => sql`${table.emergencyId} = ${closedId}`;
    const n = (from: string, where = sql`true`) =>
      count(db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.raw(from)} WHERE ${where}`));

    expect(await n("worksite_contacts", sql`worksite_id = ${seeded.worksiteId}`)).toBe(0);
    expect(await n("contact_views", byEmergency(contactViews))).toBe(0);
    expect(await n("emergency_members", byEmergency(emergencyMembers))).toBe(0);
    expect(await n("notifications", byEmergency(notifications))).toBe(0);
    expect(await n("emergency_notices", byEmergency(emergencyNotices))).toBe(0);
    expect(await n("invitations", byEmergency(invitations))).toBe(0);
    expect(await n("shift_signups", sql`user_id = ${people.volunteer}`)).toBe(0);
    expect(await n("rate_limits", sql`key = 'report:ip:hash'`)).toBe(0);
    // Feedback stays without its way to reply.
    expect(await n("feedback", sql`emergency_id = ${closedId} AND contact IS NULL`)).toBe(1);
    expect(await n("feedback", sql`emergency_id = ${closedId} AND contact IS NOT NULL`)).toBe(0);

    const [item] = await db.select().from(workItems).where(eq(workItems.id, seeded.workItemId));
    expect(item).toMatchObject({ claimedBy: null, verifiedBy: null, status: "open_claimed" });
    expect(await n("work_item_events", sql`actor_id IS NOT NULL AND emergency_id = ${closedId}`)).toBe(0);
    expect(
      await n(
        "worksite_updates",
        sql`(reported_by IS NOT NULL OR cancelled_by IS NOT NULL) AND emergency_id = ${closedId}`,
      ),
    ).toBe(0);
    const [home] = await db.select().from(worksites).where(eq(worksites.id, seeded.worksiteId));
    expect(home).toMatchObject({ hazardsReviewedBy: null, hazards: ["gas"] });
    const [event] = await db.select().from(adminEvents).where(eq(adminEvents.emergencyId, closedId));
    expect(event).toMatchObject({ actorId: null, targetId: null, action: "test_action" });

    // Aggregates stay: the home, its work, the shift and its count.
    expect(await n("worksites", sql`emergency_id = ${closedId}`)).toBe(1);
    expect(await n("shifts", sql`emergency_id = ${closedId} AND filled = 1`)).toBe(1);

    // The volunteer and the coordinator are gone, with their preferences; the admin and the
    // person still helping elsewhere stay.
    const remaining = await db.select({ id: users.id }).from(users);
    const ids = remaining.map((user) => user.id);
    expect(ids).not.toContain(people.volunteer);
    expect(ids).not.toContain(people.coordinator);
    expect(ids).toContain(people.admin);
    expect(ids).toContain(people.stillHelping);
    expect(ids).toContain(people.claimsElsewhere);
    expect(await n("notification_preferences", sql`user_id = ${people.volunteer}`)).toBe(0);
    expect(await n("sessions", sql`user_id = ${people.volunteer}`)).toBe(0);

    const serialized = JSON.stringify(
      await db.execute(sql`SELECT * FROM worksites WHERE emergency_id = ${closedId}`),
    );
    expect(serialized).not.toContain("Calle inventada");
  });

  // A new table that points at users must be added to the purge, or personal data outlives the
  // emergency. This lists the database's own foreign keys, so nobody has to remember.
  it("covers every foreign key to users", async () => {
    const rows = await db.execute<{ ref: string }>(sql`
      SELECT c.conrelid::regclass::text || '.' || a.attname AS ref
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
    `);
    expect(rows.map((row) => row.ref).sort()).toEqual(Object.keys(USER_REFERENCES).sort());
  });
});
