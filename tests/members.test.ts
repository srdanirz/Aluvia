import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assignWorksite, unassignWorksite } from "@/features/members/server/assignments";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/features/members/server/invitations";
import {
  approveMemberRole,
  joinEmergency,
  rejectMemberRole,
  requestMemberRole,
  revokeMemberRole,
} from "@/features/members/server/membership";
import {
  listActiveInvitations,
  listElevatedMembers,
  listFieldVolunteersForWorksite,
  listPendingMemberRequests,
} from "@/features/members/server/queries";
import { canUpdateWorksite, findEmergencyAccess } from "@/shared/auth/access";
import { sqlArray } from "@/shared/db/sql-array";
import { disasterTypes, emergencies, workItems, workTypes, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { NOW, rejectionCode } from "./setup/fixtures";

const RACERS = 8;
const { db, counter, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

async function createEmergency(slug: string, status: "open" | "closed" = "open") {
  const [row] = await db
    .insert(emergencies)
    .values({
      slug,
      disasterTypeKey: "members_test",
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

async function createWorksite(emergencyId: string) {
  const id = randomUUID();
  await db
    .insert(worksites)
    .values({ id, emergencyId, location: { x: -70.5, y: -33.4 }, source: "neighbor" });
  return id;
}

async function createUsers(n: number, platformRole: "admin" | null = null): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO users (name, platform_role)
    SELECT 'Person ' || i, ${platformRole}::platform_role FROM generate_series(1, ${n}) AS i
    RETURNING id`);
  return rows.map((row) => row.id);
}

async function createUser(platformRole: "admin" | null = null) {
  const [id] = await createUsers(1, platformRole);
  if (!id) throw new Error("user not created");
  return id;
}

async function memberRole(emergencyId: string, userId: string) {
  const [row] = await db.execute<{ role: string; requested_role: string | null }>(sql`
    SELECT role, requested_role FROM emergency_members WHERE emergency_id = ${emergencyId} AND user_id = ${userId}`);
  return row ?? null;
}

let emergency: string;
let otherEmergency: string;
let closedEmergency: string;
let admin: string;
let secondAdmin: string;

beforeAll(async () => {
  await db.insert(disasterTypes).values({ key: "members_test", name: { es: "Prueba" } });
  [emergency, otherEmergency, closedEmergency] = await Promise.all([
    createEmergency("members-a"),
    createEmergency("members-b"),
    createEmergency("members-closed", "closed"),
  ]);
  const admins = await createUsers(2, "admin");
  if (!admins[0] || !admins[1]) throw new Error("admins not created");
  [admin, secondAdmin] = [admins[0], admins[1]];
});

/** A field volunteer of `emergency`, approved by `admin`. */
async function createFieldVolunteer(emergencyId = emergency) {
  const userId = await createUser();
  await requestMemberRole(db, { userId, emergencyId, role: "field_volunteer" });
  const approved = await approveMemberRole(db, admin, { emergencyId, userId, role: "field_volunteer" });
  if (!approved.ok) throw new Error(approved.code);
  return userId;
}

describe("joining", () => {
  it("joins an open emergency once and refuses a closed one", async () => {
    const userId = await createUser();
    expect(await joinEmergency(db, { userId, emergencyId: emergency })).toEqual({ ok: true });
    expect(await joinEmergency(db, { userId, emergencyId: emergency })).toEqual({ ok: true });
    expect(await memberRole(emergency, userId)).toEqual({ role: "volunteer", requested_role: null });
    expect(await joinEmergency(db, { userId, emergencyId: closedEmergency })).toEqual({
      ok: false,
      code: "emergency_closed",
    });
    expect(await joinEmergency(db, { userId, emergencyId: randomUUID() })).toEqual({
      ok: false,
      code: "emergency_not_found",
    });
  });
});

describe("roles", () => {
  it("grants nothing until another admin approves the request", async () => {
    const userId = await createUser();
    expect(await requestMemberRole(db, { userId, emergencyId: emergency, role: "coordinator" })).toEqual({
      ok: true,
    });
    expect(await memberRole(emergency, userId)).toEqual({ role: "volunteer", requested_role: "coordinator" });
    expect((await findEmergencyAccess(db, userId, emergency)).role).toBe("volunteer");

    expect(
      await approveMemberRole(db, userId, { emergencyId: emergency, userId, role: "coordinator" }),
    ).toEqual({
      ok: false,
      code: "cannot_approve_self",
    });
    const stranger = await createUser();
    expect(
      await approveMemberRole(db, stranger, { emergencyId: emergency, userId, role: "coordinator" }),
    ).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await approveMemberRole(db, admin, { emergencyId: emergency, userId, role: "coordinator" }),
    ).toEqual({
      ok: true,
      role: "coordinator",
    });
    expect(await memberRole(emergency, userId)).toEqual({ role: "coordinator", requested_role: null });
  });

  it("does not let an admin approve their own request", async () => {
    expect(
      await requestMemberRole(db, { userId: admin, emergencyId: emergency, role: "coordinator" }),
    ).toEqual({
      ok: true,
    });
    expect(
      await approveMemberRole(db, admin, { emergencyId: emergency, userId: admin, role: "coordinator" }),
    ).toEqual({
      ok: false,
      code: "cannot_approve_self",
    });
    // The database holds the line too, whatever the code above does.
    const code = await rejectionCode(
      db.execute(sql`
        UPDATE emergency_members SET role = 'coordinator', requested_role = NULL, approved_at = now(), approved_by = ${admin}
        WHERE emergency_id = ${emergency} AND user_id = ${admin}`),
    );
    expect(code).toBe(CHECK_VIOLATION);
    await rejectMemberRole(db, secondAdmin, { emergencyId: emergency, userId: admin });
  });

  it("rejects an elevated role without an approval", async () => {
    const userId = await createUser();
    const code = await rejectionCode(
      db.execute(
        sql`INSERT INTO emergency_members (emergency_id, user_id, role) VALUES (${emergency}, ${userId}, 'coordinator')`,
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("applies one approval when two admins approve at once", async () => {
    const userId = await createUser();
    await requestMemberRole(db, { userId, emergencyId: emergency, role: "coordinator" });
    const results = await Promise.all(
      [admin, secondAdmin, admin, secondAdmin].map((actor) =>
        approveMemberRole(db, actor, { emergencyId: emergency, userId, role: "coordinator" }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "no_pending_request")).toHaveLength(3);
    const [events] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM admin_events WHERE action = 'member_role_approved' AND target_id = ${userId}`);
    expect(events?.n).toBe(1);
  });

  it("does not let someone ask for a role they already exceed", async () => {
    const userId = await createUser();
    await requestMemberRole(db, { userId, emergencyId: emergency, role: "coordinator" });
    await approveMemberRole(db, admin, { emergencyId: emergency, userId, role: "coordinator" });
    expect(await requestMemberRole(db, { userId, emergencyId: emergency, role: "field_volunteer" })).toEqual({
      ok: false,
      code: "already_has_role",
    });
  });

  it("approves only the role the admin saw, and freezes a pending request", async () => {
    const userId = await createUser();
    await requestMemberRole(db, { userId, emergencyId: emergency, role: "field_volunteer" });
    expect(await requestMemberRole(db, { userId, emergencyId: emergency, role: "coordinator" })).toEqual({
      ok: false,
      code: "request_pending",
    });
    // A stale screen that thought the request was for coordinator grants nothing.
    expect(
      await approveMemberRole(db, admin, { emergencyId: emergency, userId, role: "coordinator" }),
    ).toEqual({
      ok: false,
      code: "no_pending_request",
    });
    expect(
      await approveMemberRole(db, admin, { emergencyId: emergency, userId, role: "field_volunteer" }),
    ).toEqual({
      ok: true,
      role: "field_volunteer",
    });
  });

  it("rejects a request, and revokes a role along with its home assignments", async () => {
    const asked = await createUser();
    await requestMemberRole(db, { userId: asked, emergencyId: emergency, role: "coordinator" });
    expect(await rejectMemberRole(db, admin, { emergencyId: emergency, userId: asked })).toEqual({
      ok: true,
    });
    expect(await memberRole(emergency, asked)).toEqual({ role: "volunteer", requested_role: null });

    const fieldVolunteer = await createFieldVolunteer();
    const home = await createWorksite(emergency);
    await assignWorksite(db, admin, { emergencyId: emergency, worksiteId: home, userId: fieldVolunteer });
    expect(await revokeMemberRole(db, admin, { emergencyId: emergency, userId: fieldVolunteer })).toEqual({
      ok: true,
    });
    expect(await memberRole(emergency, fieldVolunteer)).toEqual({ role: "volunteer", requested_role: null });
    const left = await db.execute(sql`SELECT 1 FROM worksite_assignments WHERE user_id = ${fieldVolunteer}`);
    expect(left).toHaveLength(0);
    expect(await revokeMemberRole(db, admin, { emergencyId: emergency, userId: fieldVolunteer })).toEqual({
      ok: false,
      code: "no_role_to_revoke",
    });
  });
});

describe("invitations", () => {
  const invite = (input: Partial<Parameters<typeof createInvitation>[2]> = {}) =>
    createInvitation(db, admin, {
      emergencyId: emergency,
      role: "volunteer",
      expiresInHours: 24,
      maxUses: null,
      worksiteIds: [],
      ...input,
    });

  async function token(input: Partial<Parameters<typeof createInvitation>[2]> = {}) {
    const result = await invite(input);
    if (!result.ok) throw new Error(result.code);
    return result;
  }

  it("is created only by an admin, for an open emergency", async () => {
    const stranger = await createUser();
    expect(
      await createInvitation(db, stranger, {
        emergencyId: emergency,
        role: "volunteer",
        expiresInHours: 24,
        maxUses: null,
        worksiteIds: [],
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(await invite({ emergencyId: closedEmergency })).toEqual({ ok: false, code: "emergency_closed" });
  });

  it("admits exactly as many people as its uses when they accept at once", async () => {
    const { token: link } = await token({ role: "field_volunteer", maxUses: 1 });
    const people = await createUsers(RACERS);
    const results = await Promise.all(people.map((userId) => acceptInvitation(db, { token: link, userId })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "used_up")).toHaveLength(RACERS - 1);
  });

  it("joins with the role approved by its creator and assigns its homes", async () => {
    const home = await createWorksite(emergency);
    const { token: link } = await token({ role: "field_volunteer", maxUses: 1, worksiteIds: [home] });
    const userId = await createUser();
    expect(await acceptInvitation(db, { token: link, userId })).toMatchObject({
      ok: true,
      slug: "members-a",
    });
    const [member] = await db.execute<{ role: string; approved_by: string }>(sql`
      SELECT role, approved_by FROM emergency_members WHERE emergency_id = ${emergency} AND user_id = ${userId}`);
    expect(member).toEqual({ role: "field_volunteer", approved_by: admin });
    const access = await findEmergencyAccess(db, userId, emergency);
    expect(await canUpdateWorksite(db, access, home)).toBe(true);
  });

  it("grants a role only while its creator is still an admin", async () => {
    const formerAdmin = await createUser("admin");
    const result = await createInvitation(db, formerAdmin, {
      emergencyId: emergency,
      role: "coordinator",
      expiresInHours: 24,
      maxUses: 1,
      worksiteIds: [],
    });
    if (!result.ok) throw new Error(result.code);
    await db.execute(sql`UPDATE users SET platform_role = NULL WHERE id = ${formerAdmin}`);
    const userId = await createUser();
    expect(await acceptInvitation(db, { token: result.token, userId })).toEqual({
      ok: false,
      code: "revoked",
    });
    expect(await memberRole(emergency, userId)).toBeNull();
  });

  it("cannot promote the admin who made it", async () => {
    const { token: link } = await token({ role: "coordinator", maxUses: 1 });
    expect(await acceptInvitation(db, { token: link, userId: admin })).toEqual({
      ok: false,
      code: "own_invitation",
    });
  });

  it("never steps someone down", async () => {
    const coordinator = await createUser();
    await requestMemberRole(db, { userId: coordinator, emergencyId: emergency, role: "coordinator" });
    await approveMemberRole(db, admin, { emergencyId: emergency, userId: coordinator, role: "coordinator" });
    const { token: link } = await token();
    expect(await acceptInvitation(db, { token: link, userId: coordinator })).toMatchObject({ ok: true });
    expect((await memberRole(emergency, coordinator))?.role).toBe("coordinator");
  });

  it("keeps its use when the person already holds the role or more", async () => {
    const coordinator = await createUser();
    await requestMemberRole(db, { userId: coordinator, emergencyId: emergency, role: "coordinator" });
    await approveMemberRole(db, admin, { emergencyId: emergency, userId: coordinator, role: "coordinator" });
    const { token: link } = await token({ role: "field_volunteer", maxUses: 1 });
    expect(await acceptInvitation(db, { token: link, userId: coordinator })).toEqual({
      ok: false,
      code: "already_has_role",
    });
    expect(await acceptInvitation(db, { token: link, userId: await createUser() })).toMatchObject({
      ok: true,
    });
  });

  it("adds a home to someone who is already a field volunteer", async () => {
    const fieldVolunteer = await createFieldVolunteer();
    const home = await createWorksite(emergency);
    const { token: link } = await token({ role: "field_volunteer", maxUses: 1, worksiteIds: [home] });
    expect(await acceptInvitation(db, { token: link, userId: fieldVolunteer })).toMatchObject({ ok: true });
    const access = await findEmergencyAccess(db, fieldVolunteer, emergency);
    expect(await canUpdateWorksite(db, access, home)).toBe(true);
  });

  it("stops working once revoked or expired", async () => {
    const revoked = await token();
    expect(
      await revokeInvitation(db, admin, { emergencyId: emergency, invitationId: revoked.invitationId }),
    ).toEqual({
      ok: true,
    });
    const userId = await createUser();
    expect(await acceptInvitation(db, { token: revoked.token, userId })).toEqual({
      ok: false,
      code: "revoked",
    });

    const expired = await token();
    await db.execute(
      sql`UPDATE invitations SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE id = ${expired.invitationId}`,
    );
    expect(await acceptInvitation(db, { token: expired.token, userId })).toEqual({
      ok: false,
      code: "expired",
    });
    expect(await acceptInvitation(db, { token: "not-a-token", userId })).toEqual({
      ok: false,
      code: "invitation_not_found",
    });
  });

  it("rejects a home of another emergency and creates nothing", async () => {
    const foreignHome = await createWorksite(otherEmergency);
    const code = await rejectionCode(
      invite({ role: "field_volunteer", maxUses: 1, worksiteIds: [foreignHome] }),
    );
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("requires a use cap for a link that grants a role", async () => {
    const code = await rejectionCode(
      db.execute(sql`
        INSERT INTO invitations (emergency_id, token_hash, role, expires_at)
        VALUES (${emergency}, ${randomUUID()}, 'coordinator', now() + interval '1 day')`),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe("home assignments and access", () => {
  it("assigns only field volunteers, only to homes of their emergency", async () => {
    const fieldVolunteer = await createFieldVolunteer();
    const volunteer = await createUser();
    await joinEmergency(db, { userId: volunteer, emergencyId: emergency });
    const home = await createWorksite(emergency);
    const foreignHome = await createWorksite(otherEmergency);
    const target = { emergencyId: emergency, worksiteId: home };

    expect(await assignWorksite(db, volunteer, { ...target, userId: fieldVolunteer })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await assignWorksite(db, admin, { ...target, userId: volunteer })).toEqual({
      ok: false,
      code: "not_field_volunteer",
    });
    expect(
      await assignWorksite(db, admin, {
        emergencyId: emergency,
        worksiteId: foreignHome,
        userId: fieldVolunteer,
      }),
    ).toEqual({ ok: false, code: "worksite_not_found" });
    expect(await assignWorksite(db, admin, { ...target, userId: fieldVolunteer })).toEqual({ ok: true });
    expect(await assignWorksite(db, admin, { ...target, userId: fieldVolunteer })).toEqual({ ok: true });
    const [events] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM admin_events WHERE action = 'worksite_assigned' AND target_id = ${home}`);
    expect(events?.n).toBe(1);

    expect(await unassignWorksite(db, admin, { ...target, userId: fieldVolunteer })).toEqual({ ok: true });
    expect(await unassignWorksite(db, admin, { ...target, userId: fieldVolunteer })).toEqual({
      ok: false,
      code: "assignment_not_found",
    });
  });

  it("decides who may update a home and who may see contacts", async () => {
    const home = await createWorksite(emergency);
    const otherHome = await createWorksite(emergency);
    const foreignHome = await createWorksite(otherEmergency);
    const fieldVolunteer = await createFieldVolunteer();
    await assignWorksite(db, admin, { emergencyId: emergency, worksiteId: home, userId: fieldVolunteer });
    const coordinator = await createUser();
    await requestMemberRole(db, { userId: coordinator, emergencyId: emergency, role: "coordinator" });
    await approveMemberRole(db, admin, { emergencyId: emergency, userId: coordinator, role: "coordinator" });
    const volunteer = await createUser();
    await joinEmergency(db, { userId: volunteer, emergencyId: emergency });

    const [field, coord, vol, adminAccess] = await Promise.all(
      [fieldVolunteer, coordinator, volunteer, admin].map((userId) =>
        findEmergencyAccess(db, userId, emergency),
      ),
    );
    if (!field || !coord || !vol || !adminAccess) throw new Error("access not loaded");
    const can = (access: typeof field, worksiteId: string) => canUpdateWorksite(db, access, worksiteId);

    expect(await Promise.all([can(field, home), can(field, otherHome), can(field, foreignHome)])).toEqual([
      true,
      false,
      false,
    ]);
    expect(await Promise.all([can(coord, home), can(coord, otherHome), can(coord, foreignHome)])).toEqual([
      true,
      true,
      false,
    ]);
    expect(await Promise.all([can(vol, home), can(adminAccess, home)])).toEqual([false, false]);
    expect(adminAccess.isPlatformAdmin).toBe(true);
  });
});

describe("claiming requires membership", () => {
  it("rejects a claim by someone who has not joined, and survives deleting a claimant", async () => {
    const home = await createWorksite(emergency);
    const id = randomUUID();
    await db.insert(workItems).values({ id, emergencyId: emergency, worksiteId: home, workTypeKey: "mud" });
    const outsider = await createUser();
    const claim = (userId: string) =>
      db.execute(sql`UPDATE work_items SET claimed_by = ${userId}, status = 'open_claimed' WHERE id = ${id}`);
    expect(await rejectionCode(claim(outsider))).toBe(FOREIGN_KEY_VIOLATION);

    await joinEmergency(db, { userId: outsider, emergencyId: emergency });
    await claim(outsider);
    // Deleting the person removes the membership and clears claimed_by in the same statement.
    await db.execute(sql`DELETE FROM users WHERE id = ${outsider}`);
    const [item] = await db.execute<{ claimed_by: string | null }>(
      sql`SELECT claimed_by FROM work_items WHERE id = ${id}`,
    );
    expect(item?.claimed_by).toBeNull();
  });
});

describe("lists", () => {
  /** Runs a list for a fresh emergency seeded with `n` rows and returns how many queries it took. */
  async function queriesFor(
    n: number,
    seed: (emergencyId: string, n: number) => Promise<void>,
    list: (emergencyId: string) => Promise<unknown>,
  ) {
    const emergencyId = await createEmergency(`list-${randomUUID()}`);
    await seed(emergencyId, n);
    counter.reset();
    await list(emergencyId);
    return counter.count;
  }

  const seedRequests = async (emergencyId: string, n: number) => {
    const people = await createUsers(n);
    await db.execute(sql`
      INSERT INTO emergency_members (emergency_id, user_id, requested_role)
      SELECT ${emergencyId}, id::uuid, 'coordinator' FROM unnest(${sqlArray(people, "uuid")}) AS id`);
  };

  const seedFieldVolunteers = async (emergencyId: string, n: number) => {
    const people = await createUsers(n);
    await db.execute(sql`
      INSERT INTO emergency_members (emergency_id, user_id, role, approved_at, approved_by)
      SELECT ${emergencyId}, id, 'field_volunteer', now(), ${admin}
      FROM unnest(${sqlArray(people, "uuid")}) AS id`);
  };

  const seedInvitations = async (emergencyId: string, n: number) => {
    await db.execute(sql`
      INSERT INTO invitations (emergency_id, token_hash, role, created_by, expires_at, max_uses)
      SELECT ${emergencyId}, md5(random()::text), 'field_volunteer', ${admin}, now() + interval '1 day', 1
      FROM generate_series(1, ${n})`);
  };

  it.each([
    ["pending requests", seedRequests, (id: string) => listPendingMemberRequests(db, { emergencyId: id })],
    [
      "members with a role",
      seedFieldVolunteers,
      (id: string) => listElevatedMembers(db, { emergencyId: id }),
    ],
    ["active invitations", seedInvitations, (id: string) => listActiveInvitations(db, { emergencyId: id })],
    [
      "field volunteers of a home",
      seedFieldVolunteers,
      (id: string) => listFieldVolunteersForWorksite(db, { emergencyId: id, worksiteId: randomUUID() }),
    ],
  ] as const)("lists %s in the same number of queries for 1 and 20 rows", async (_name, seed, list) => {
    expect(await queriesFor(1, seed, list)).toBe(await queriesFor(20, seed, list));
  });

  it("pages with a cursor without skipping or repeating", async () => {
    const emergencyId = await createEmergency(`page-${randomUUID()}`);
    await seedRequests(emergencyId, 60);
    const first = await listPendingMemberRequests(db, { emergencyId });
    const second = await listPendingMemberRequests(db, { emergencyId, after: first.nextCursor ?? undefined });
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.items, ...second.items].map((item) => item.userId));
    expect(ids.size).toBe(60);
  });
});
