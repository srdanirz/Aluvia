import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { newWorksiteSchema, worksiteReportSchema } from "@/features/worksites/schemas";
import {
  createWorksites,
  findOpenEmergencyId,
  findReportForm,
  listNearbyWorksites,
  markWorksiteHazardsReviewed,
  placeWorksite,
  resolveWorksiteReviewFlag,
  worksiteAcceptsClaims,
} from "@/features/worksites/server";
import {
  emergencies,
  emergencyMembers,
  emergencySettings,
  users,
  workItemEvents,
  workItems,
  workTypes,
  worksiteContacts,
  worksites,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

const RACERS = 8;
const { db, counter, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

// Invented points in open countryside; about 11 m per 0.0001 degree of latitude.
const ORIGIN = { lng: -70.5, lat: -33.4 };
const north = (meters: number) => ({ lng: ORIGIN.lng, lat: ORIGIN.lat + meters / 111_320 });

const report = (overrides: Record<string, unknown> = {}) =>
  newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location: ORIGIN,
    workTypeKeys: ["mud"],
    ...overrides,
  });

let emergencyId: string;
let otherEmergencyId: string;

beforeAll(async () => {
  emergencyId = await createEmergency(db, "report-a");
  otherEmergencyId = await createEmergency(db, "report-b", { workTypeKeys: ["roof"] });
});

async function homesWithId(ids: string[]) {
  const [row] = await db.select({ n: count() }).from(worksites).where(inArray(worksites.id, ids));
  return row?.n ?? 0;
}

describe("report schema", () => {
  it("needs a point or a written address, and a need or a few words of what happened", () => {
    const base = { id: randomUUID(), locale: "es", workTypeKeys: ["mud"] };
    expect(worksiteReportSchema.safeParse({ ...base, location: null }).success).toBe(false);
    expect(
      worksiteReportSchema.safeParse({ ...base, location: null, contact: { addressText: "Calle Falsa 123" } })
        .success,
    ).toBe(true);
    expect(worksiteReportSchema.safeParse({ ...base, location: ORIGIN, workTypeKeys: [] }).success).toBe(
      false,
    );
    const described = { ...base, location: ORIGIN, workTypeKeys: [], contact: { notes: "Entró barro" } };
    expect(worksiteReportSchema.safeParse(described).success).toBe(true);
  });

  it("rejects consent without a phone", () => {
    const parsed = worksiteReportSchema.safeParse({
      id: randomUUID(),
      locale: "es",
      location: ORIGIN,
      workTypeKeys: ["mud"],
      contact: { notifyChannel: "sms" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("createWorksites", () => {
  it("creates the home, its work items, their events and the contact in one go", async () => {
    // Placeholder number from no real person; only its shape matters.
    const input = report({
      workTypeKeys: ["mud", "water"],
      hasVulnerablePeople: true,
      contact: { phone: "+56900000000", notifyChannel: "whatsapp", addressText: "Pasaje Inventado 1" },
    });
    const result = await createWorksites(db, { emergencyId, source: "neighbor", reports: [input] });
    expect(result).toEqual({ ok: true, created: [input.id] });

    const [home] = await db
      .select({
        source: worksites.source,
        location: worksites.location,
        vulnerable: worksites.hasVulnerablePeople,
        waiting: sql<boolean>`${worksites.unclaimedSince} IS NOT NULL`,
      })
      .from(worksites)
      .where(eq(worksites.id, input.id));
    expect(home).toEqual({
      source: "neighbor",
      location: { x: ORIGIN.lng, y: ORIGIN.lat },
      vulnerable: true,
      waiting: true,
    });

    const items = await db
      .select({ id: workItems.id, key: workItems.workTypeKey, status: workItems.status })
      .from(workItems)
      .where(eq(workItems.worksiteId, input.id));
    expect(items.map((item) => item.key).sort()).toEqual(["mud", "water"]);
    expect(items.every((item) => item.status === "open_unclaimed")).toBe(true);

    const [events] = await db
      .select({ n: count() })
      .from(workItemEvents)
      .where(
        inArray(
          workItemEvents.workItemId,
          items.map((item) => item.id),
        ),
      );
    expect(events?.n).toBe(2);

    const [contact] = await db
      .select({
        channel: worksiteContacts.notifyChannel,
        consent: worksiteContacts.notifyConsentAt,
        locale: worksiteContacts.locale,
      })
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, input.id));
    expect(contact?.channel).toBe("whatsapp");
    expect(contact?.consent).toBeInstanceOf(Date);
    expect(contact?.locale).toBe("es");
  });

  it("creates a home with only a written address and no contact row when nothing else was given", async () => {
    const input = report({ location: null, contact: { addressText: "Calle Inventada 42" } });
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [input] });
    const [home] = await db
      .select({ location: worksites.location })
      .from(worksites)
      .where(eq(worksites.id, input.id));
    expect(home?.location).toBeNull();

    const bare = report();
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [bare] });
    const [contacts] = await db
      .select({ n: count() })
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, bare.id));
    expect(contacts?.n).toBe(0);
  });

  it("treats a retry as success without writing anything twice", async () => {
    const input = report({ workTypeKeys: ["mud", "water"] });
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [input] });
    const retry = await createWorksites(db, { emergencyId, source: "neighbor", reports: [input] });
    expect(retry).toEqual({ ok: true, created: [] });
    const [items] = await db.select({ n: count() }).from(workItems).where(eq(workItems.worksiteId, input.id));
    expect(items?.n).toBe(2);
  });

  it("creates the home exactly once when the same report races itself", async () => {
    const input = report({ workTypeKeys: ["mud", "water"] });
    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        createWorksites(db, { emergencyId, source: "neighbor", reports: [input] }),
      ),
    );
    expect(results.filter((r) => r.ok && r.created.length === 1)).toHaveLength(1);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await homesWithId([input.id])).toBe(1);
    const [items] = await db.select({ n: count() }).from(workItems).where(eq(workItems.worksiteId, input.id));
    expect(items?.n).toBe(2);
  });

  it("writes nothing when a need is inactive or from another emergency's catalog", async () => {
    await db.update(workTypes).set({ isActive: false }).where(eq(workTypes.emergencyId, otherEmergencyId));
    const inactive = report({ workTypeKeys: ["mud"] });
    const foreign = report({ workTypeKeys: ["mud", "roof"] });
    expect(
      await createWorksites(db, { emergencyId, source: "neighbor", reports: [inactive, foreign] }),
    ).toEqual({
      ok: false,
      code: "invalid_work_type",
    });
    expect(await homesWithId([inactive.id, foreign.id])).toBe(0);

    const ownInactive = report({ workTypeKeys: ["roof"] });
    expect(
      await createWorksites(db, {
        emergencyId: otherEmergencyId,
        source: "neighbor",
        reports: [ownInactive],
      }),
    ).toEqual({ ok: false, code: "invalid_work_type" });
  });

  it("records an official import with no work as affected and not waiting", async () => {
    const official = report({
      workTypeKeys: [],
      contact: { addressText: "Predio Inventado 5", notes: "ROL 000-0" },
    });
    expect(await createWorksites(db, { emergencyId, source: "official", reports: [official] })).toEqual({
      ok: true,
      created: [official.id],
    });
    const [home] = await db
      .select({ source: worksites.source, waiting: worksites.unclaimedSince })
      .from(worksites)
      .where(eq(worksites.id, official.id));
    expect(home).toEqual({ source: "official", waiting: null });
    const [items] = await db
      .select({ n: count() })
      .from(workItems)
      .where(eq(workItems.worksiteId, official.id));
    expect(items?.n).toBe(0);
  });

  it("costs the same queries for 1 home and for 20", async () => {
    const measure = async (n: number) => {
      const batch = Array.from({ length: n }, () =>
        report({ workTypeKeys: ["mud", "water"], contact: { addressText: "Calle Inventada 7" } }),
      );
      counter.reset();
      const result = await createWorksites(db, { emergencyId, source: "social", reports: batch });
      expect(result.ok && result.created.length).toBe(n);
      return counter.count;
    };
    expect(await measure(20)).toBe(await measure(1));
  });
});

describe("report screen and lookups", () => {
  it("loads the open emergency and its active catalog in one query, localized with fallback", async () => {
    counter.reset();
    const form = await findReportForm({ slug: "report-a", locale: "en" }, db);
    expect(counter.count).toBe(1);
    expect(form?.emergency.name).toBe("Emergency report-a");
    // Work type names only have "es": the emergency's default fills in.
    expect(form?.workTypes).toEqual([
      { key: "mud", name: "mud" },
      { key: "water", name: "water" },
    ]);
    expect(await findReportForm({ slug: "missing", locale: "es" }, db)).toBeNull();
    expect(await findOpenEmergencyId("report-a", db)).toBe(emergencyId);
  });
});

describe("duplicates and pins", () => {
  it("lists homes within 15 m only, nearest first, never the home itself", async () => {
    const zone = await createEmergency(db, "report-pins");
    const [here, near, far] = [
      report({ location: ORIGIN }),
      report({ location: north(10) }),
      report({ location: north(25) }),
    ];
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [here, near, far] });

    const nearby = await listNearbyWorksites({ emergencyId: zone, location: ORIGIN, excludeId: here.id }, db);
    expect(nearby.map((home) => home.id)).toEqual([near.id]);
    expect(nearby[0]?.distanceMeters).toBe(10);
  });

  it("warns before placing a pin next to another home, then guards the write by version", async () => {
    const zone = await createEmergency(db, "report-place");
    const existing = report({ location: ORIGIN });
    const unplaced = report({ location: null, contact: { addressText: "Calle Inventada 9" } });
    await createWorksites(db, { emergencyId: zone, source: "social", reports: [existing, unplaced] });
    const place = { emergencyId: zone, worksiteId: unplaced.id, location: north(5) };

    const warned = await placeWorksite(db, { ...place, version: 0, allowNearby: false });
    expect(warned).toMatchObject({ ok: false, code: "possible_duplicate", nearby: [{ id: existing.id }] });

    expect(await placeWorksite(db, { ...place, version: 0, allowNearby: true })).toEqual({
      ok: true,
      version: 1,
    });
    expect(await placeWorksite(db, { ...place, version: 0, allowNearby: true })).toEqual({
      ok: false,
      code: "stale_version",
    });
  });
});

describe("concurrent pins", () => {
  it("lets only one of two pins placed at once a few meters apart through without a warning", async () => {
    const zone = await createEmergency(db, "report-race");
    const [a, b] = [0, 1].map(() =>
      report({ location: null, contact: { addressText: "Calle Inventada 11" } }),
    );
    if (!a || !b) throw new Error("no reports");
    await createWorksites(db, { emergencyId: zone, source: "social", reports: [a, b] });
    const results = await Promise.all(
      [
        { id: a.id, location: ORIGIN },
        { id: b.id, location: north(4) },
      ].map(({ id, location }) =>
        placeWorksite(db, { emergencyId: zone, worksiteId: id, location, version: 0, allowNearby: false }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "possible_duplicate")).toHaveLength(1);
  });
});

describe("review flags and hazards", () => {
  const flagsOf = async (id: string) => {
    const [row] = await db
      .select({ flags: worksites.reviewFlags })
      .from(worksites)
      .where(eq(worksites.id, id));
    return row?.flags;
  };

  it("flags a point outside the area, a nearby home and a person in danger, without refusing any", async () => {
    const zone = await createEmergency(db, "report-flags");
    // A small invented square around ORIGIN.
    await db.execute(sql`
      UPDATE ${emergencies}
      SET area = ST_Multi(ST_MakeEnvelope(-70.51, -33.41, -70.49, -33.39, 4326))
      WHERE id = ${zone}
    `);
    const inside = report({ location: ORIGIN });
    const outside = report({ location: { lng: -71, lat: -33.4 } });
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [inside, outside] });
    const twin = report({ location: north(5), isPersonInDanger: true });
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [twin] });
    const coarse = report({ location: { lng: -70.495, lat: -33.395 }, locationAccuracyMeters: 900 });
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [coarse] });
    const noPoint = report({ location: null, contact: { addressText: "Calle Inventada 3" } });
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [noPoint] });

    expect(await flagsOf(inside.id)).toEqual([]);
    expect(await flagsOf(outside.id)).toEqual(["outside_area"]);
    expect(await flagsOf(twin.id)).toEqual(["possible_duplicate", "person_in_danger"]);
    expect(await flagsOf(noPoint.id)).toEqual([]);
    expect(await flagsOf(coarse.id)).toEqual(["imprecise_location"]);

    expect(
      await resolveWorksiteReviewFlag(db, {
        emergencyId: zone,
        worksiteId: twin.id,
        version: 0,
        flag: "person_in_danger",
      }),
    ).toEqual({
      ok: true,
      version: 1,
    });
    expect(await flagsOf(twin.id)).toEqual(["possible_duplicate"]);
  });

  it("blocks claiming a home with unreviewed hazards until a coordinator reviews them", async () => {
    const zone = await createEmergency(db, "report-hazards");
    const risky = report({ hazards: ["gas"] });
    await createWorksites(db, { emergencyId: zone, source: "neighbor", reports: [risky] });
    const [volunteer] = await db
      .insert(users)
      .values({ name: "Voluntaria de prueba" })
      .returning({ id: users.id });
    if (!volunteer) throw new Error("no user");
    // Only members claim work (work_items_claimant_fk, ADR 0013).
    await db.insert(emergencyMembers).values({ emergencyId: zone, userId: volunteer.id });

    const claim = () =>
      db
        .update(workItems)
        .set({ claimedBy: volunteer.id, status: "open_claimed" })
        .where(
          sql`${workItems.worksiteId} = ${risky.id} AND ${workItems.claimedBy} IS NULL AND ${worksiteAcceptsClaims(workItems.worksiteId)}`,
        )
        .returning({ id: workItems.id });

    expect(await claim()).toEqual([]);
    expect(
      await markWorksiteHazardsReviewed(db, {
        emergencyId: zone,
        worksiteId: risky.id,
        version: 0,
        reviewedBy: volunteer.id,
      }),
    ).toEqual({ ok: true, version: 1 });
    expect(await claim()).toHaveLength(1);
  });

  it("serves the emergency numbers in the report form, localized", async () => {
    const zone = await createEmergency(db, "report-numbers");
    await db.insert(emergencySettings).values({
      emergencyId: zone,
      emergencyNumbers: [
        { label: { es: "Bomberos", en: "Fire" }, phone: "132" },
        { label: { es: "Ambulancia" }, phone: "131" },
      ],
    });
    const form = await findReportForm({ slug: "report-numbers", locale: "en" }, db);
    expect(form?.emergencyNumbers).toEqual([
      { label: "Fire", phone: "132" },
      { label: "Ambulancia", phone: "131" },
    ]);
  });
});
