import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findPublicWorksite } from "@/features/map/server/public-worksite";
import { acceptInvitation, createInvitation } from "@/features/members/server/invitations";
import { approveMemberRole, requestMemberRole, revokeMemberRole } from "@/features/members/server/membership";
import { createOrganization, listOrganizations } from "@/features/organizations/server";
import { listReportedWorksites } from "@/features/worksites/server";
import { canViewContacts, findEmergencyAccess, isCoordinator } from "@/shared/auth/access";
import { emergencies, organizations, workItems, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW, rejectionCode } from "./setup/fixtures";

const RACERS = 6;
const { db, counter, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

const CHECK_VIOLATION = "23514";

let emergency: string;
let otherEmergency: string;
let admin: string;
let secondAdmin: string;

async function createUser(platformRole: "admin" | null = null) {
  const [row] = await db.execute<{ id: string }>(sql`
    INSERT INTO users (name, platform_role) VALUES ('Persona inventada', ${platformRole}::platform_role)
    RETURNING id`);
  if (!row) throw new Error("user not created");
  return row.id;
}

async function newOrganization(name: string, emergencyId = emergency, publicContact: string | null = null) {
  const result = await createOrganization(db, admin, { emergencyId, name, publicContact });
  if (!result.ok) throw new Error(result.code);
  return result.organizationId;
}

/** A user who accepted a coordinator link of `organizationId`. */
async function createOrganizationCoordinator(organizationId: string, emergencyId = emergency) {
  const invitation = await createInvitation(db, admin, {
    emergencyId,
    role: "coordinator",
    expiresInHours: 24,
    maxUses: 1,
    worksiteIds: [],
    organizationId,
  });
  if (!invitation.ok) throw new Error(invitation.code);
  const userId = await createUser();
  const accepted = await acceptInvitation(db, { token: invitation.token, userId });
  if (!accepted.ok) throw new Error(accepted.code);
  return userId;
}

async function membership(emergencyId: string, userId: string) {
  const [row] = await db.execute<{ role: string; organization_id: string | null }>(sql`
    SELECT role, organization_id FROM emergency_members
    WHERE emergency_id = ${emergencyId} AND user_id = ${userId}`);
  return row ?? null;
}

async function createWorksite(emergencyId = emergency) {
  const id = randomUUID();
  await db
    .insert(worksites)
    .values({ id, emergencyId, location: { x: -70.5, y: -33.4 }, source: "neighbor", updatedAt: NOW });
  return id;
}

async function claimBy(worksiteId: string, userId: string, emergencyId = emergency) {
  await db.insert(workItems).values({
    id: randomUUID(),
    emergencyId,
    worksiteId,
    workTypeKey: "mud",
    status: "open_claimed",
    claimedBy: userId,
    claimedAt: NOW,
  });
}

beforeAll(async () => {
  [emergency, otherEmergency] = await Promise.all([
    createEmergency(db, "organizations-a"),
    createEmergency(db, "organizations-b"),
  ]);
  [admin, secondAdmin] = await Promise.all([createUser("admin"), createUser("admin")]);
});

describe("creating an organization", () => {
  it("is for platform admins only", async () => {
    const volunteer = await createUser();
    expect(
      await createOrganization(db, volunteer, {
        emergencyId: emergency,
        name: "Grupo sin permiso",
        publicContact: null,
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    const rows = await db.select().from(organizations).where(eq(organizations.name, "Grupo sin permiso"));
    expect(rows).toHaveLength(0);
  });

  it("creates one per name, whatever the case and spacing, also when two admins race", async () => {
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        createOrganization(db, i % 2 ? admin : secondAdmin, {
          emergencyId: emergency,
          name: i % 2 ? "Junta Vecinal Inventada" : "  junta vecinal inventada ",
          publicContact: "+56 2 0000 0000",
        }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => !result.ok && result.code)).toEqual(
      Array.from({ length: RACERS - 1 }, () => "organization_exists"),
    );
    // The same name in another emergency is another group.
    expect(
      (
        await createOrganization(db, admin, {
          emergencyId: otherEmergency,
          name: "Junta Vecinal Inventada",
          publicContact: null,
        })
      ).ok,
    ).toBe(true);
  });

  it("refuses a closed emergency", async () => {
    const closed = await createEmergency(db, "organizations-closed");
    await db.update(emergencies).set({ status: "closed", closedAt: NOW }).where(eq(emergencies.id, closed));
    expect(
      await createOrganization(db, admin, { emergencyId: closed, name: "Tarde", publicContact: null }),
    ).toEqual({ ok: false, code: "emergency_closed" });
  });
});

describe("inviting coordinators of an organization", () => {
  it("makes whoever accepts a coordinator of the emergency in that organization", async () => {
    const organizationId = await newOrganization("Parroquia inventada");
    const userId = await createOrganizationCoordinator(organizationId);
    expect(await membership(emergency, userId)).toEqual({
      role: "coordinator",
      organization_id: organizationId,
    });

    // Exactly a coordinator's access in this emergency, none in another.
    const access = await findEmergencyAccess(db, userId, emergency);
    expect(isCoordinator(access)).toBe(true);
    expect(canViewContacts(access)).toBe(true);
    expect((await findEmergencyAccess(db, userId, otherEmergency)).role).toBeNull();
  });

  it("refuses an organization of another emergency and a link that is not for coordinators", async () => {
    const foreign = await newOrganization("ONG de otra emergencia", otherEmergency);
    expect(
      await createInvitation(db, admin, {
        emergencyId: emergency,
        role: "coordinator",
        expiresInHours: 24,
        maxUses: 1,
        worksiteIds: [],
        organizationId: foreign,
      }),
    ).toEqual({ ok: false, code: "organization_not_found" });

    const own = await newOrganization("ONG inventada");
    expect(
      await rejectionCode(
        db.execute(sql`
          INSERT INTO invitations (emergency_id, token_hash, role, expires_at, max_uses, organization_id)
          VALUES (${emergency}, ${randomUUID()}, 'volunteer', now() + interval '1 day', 1, ${own})`),
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it("brings a coordinator without an organization into one, and revoking takes them out", async () => {
    const userId = await createUser();
    await requestMemberRole(db, { userId, emergencyId: emergency, role: "coordinator" });
    const approved = await approveMemberRole(db, admin, {
      emergencyId: emergency,
      userId,
      role: "coordinator",
    });
    expect(approved.ok).toBe(true);
    const organizationId = await newOrganization("Club inventado");
    const invitation = await createInvitation(db, admin, {
      emergencyId: emergency,
      role: "coordinator",
      expiresInHours: 24,
      maxUses: 2,
      worksiteIds: [],
      organizationId,
    });
    if (!invitation.ok) throw new Error(invitation.code);
    expect((await acceptInvitation(db, { token: invitation.token, userId })).ok).toBe(true);
    expect(await membership(emergency, userId)).toEqual({
      role: "coordinator",
      organization_id: organizationId,
    });
    // Already in this organization: the second use stays for someone else.
    expect(await acceptInvitation(db, { token: invitation.token, userId })).toEqual({
      ok: false,
      code: "already_has_role",
    });

    expect((await revokeMemberRole(db, admin, { emergencyId: emergency, userId })).ok).toBe(true);
    expect(await membership(emergency, userId)).toEqual({ role: "volunteer", organization_id: null });
  });

  it("keeps the organization only on coordinators", async () => {
    const organizationId = await newOrganization("Brigada inventada");
    const userId = await createOrganizationCoordinator(organizationId);
    expect(
      await rejectionCode(
        db.execute(sql`
          UPDATE emergency_members SET role = 'field_volunteer'
          WHERE emergency_id = ${emergency} AND user_id = ${userId}`),
      ),
    ).toBe(CHECK_VIOLATION);
  });
});

describe("listing organizations", () => {
  it("lists each group with its coordinators in one query, however many", async () => {
    const listed = await createEmergency(db, "organizations-list");
    const read = async () => {
      counter.reset();
      const page = await listOrganizations(db, { emergencyId: listed });
      return { page, queries: counter.count };
    };
    const first = await newOrganization("Primera", listed);
    const coordinator = await createOrganizationCoordinator(first, listed);
    const one = await read();
    expect(one.page.items).toMatchObject([
      { id: first, coordinatorCount: 1, coordinators: [{ userId: coordinator, name: "Persona inventada" }] },
    ]);

    await Promise.all(Array.from({ length: 19 }, (_, i) => newOrganization(`Grupo ${i}`, listed)));
    const twenty = await read();
    expect(twenty.page.items).toHaveLength(20);
    expect(twenty.queries).toBe(one.queries);
    expect(one.queries).toBe(1);
  });
});

describe("public views", () => {
  it("name the organization whose coordinator claimed the home's work, never the person", async () => {
    const organizationId = await newOrganization("Iglesia inventada", emergency, "contacto@ejemplo.invalid");
    const coordinator = await createOrganizationCoordinator(organizationId);
    const claimed = await createWorksite();
    await claimBy(claimed, coordinator);
    const unclaimed = await createWorksite();

    const home = await findPublicWorksite(
      { slug: "organizations-a", id: claimed, locale: "es", now: NOW },
      db,
    );
    expect(home?.organizations).toEqual([
      { name: "Iglesia inventada", publicContact: "contacto@ejemplo.invalid" },
    ]);
    expect(JSON.stringify(home)).not.toContain(coordinator);
    const other = await findPublicWorksite(
      { slug: "organizations-a", id: unclaimed, locale: "es", now: NOW },
      db,
    );
    expect(other?.organizations).toEqual([]);

    counter.reset();
    const page = await listReportedWorksites(db, {
      emergencyId: emergency,
      locale: "es",
      now: NOW,
      cursor: null,
      contactViewerId: null,
    });
    expect(counter.count).toBe(1);
    const byId = new Map(page.items.map((item) => [item.id, item.organizations.map((o) => o.name)]));
    expect(byId.get(claimed)).toEqual(["Iglesia inventada"]);
    expect(byId.get(unclaimed)).toEqual([]);
  });
});

describe("closing", () => {
  it("deletes an emergency with organizations and their coordinators in one go", async () => {
    const doomed = await createEmergency(db, "organizations-doomed");
    const organizationId = await newOrganization("Grupo efímero", doomed);
    await createOrganizationCoordinator(organizationId, doomed);
    await db.delete(emergencies).where(eq(emergencies.id, doomed));
    expect(await db.select().from(organizations).where(eq(organizations.emergencyId, doomed))).toEqual([]);
  });
});
