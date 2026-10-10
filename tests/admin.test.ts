import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { areaSchema } from "@/features/admin/area";
import { createDisasterType, updateDisasterType } from "@/features/admin/server/disaster-types";
import {
  closeEmergency,
  createEmergency,
  updateEmergencyArea,
  updateEmergencySettings,
} from "@/features/admin/server/emergencies";
import { findActiveNotice, publishNotice, withdrawNotice } from "@/features/admin/server/notices";
import { grantPlatformAdmin } from "@/features/admin/server/platform-admins";
import {
  findDisasterType,
  findEmergency,
  listAllDisasterTypes,
  listDisasterTypes,
  listEmergencies,
} from "@/features/admin/server/queries";
import { emergencySchema } from "@/features/admin/schemas";
import {
  adminEvents,
  disasterTypes,
  disasterTypeWorkTypes,
  emergencies,
  emergencySettings,
  users,
  workTypes,
} from "@/shared/db/schema";
import { seedDatabase } from "@/shared/db/seeds";
import { PAGE_SIZE } from "@/shared/lib/pagination";

import { createTestDb } from "./setup/db";

const RACERS = 8;
const { db, counter, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

// Invented data only (STYLEGUIDE, Tests): keys and slugs are prefixed so they never meet the seeds.
const SQUARE = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-70.55, -33.4],
      [-70.5, -33.4],
      [-70.5, -33.36],
      [-70.55, -33.36],
      [-70.55, -33.4],
    ],
  ],
});
// Self-intersecting: valid GeoJSON shape, invalid polygon.
const BOWTIE = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ],
  ],
});

let actorId: string;

function area(text: string) {
  return areaSchema.parse(text);
}

function emergencyInput(overrides: Partial<Parameters<typeof createEmergency>[2]> = {}) {
  return {
    id: randomUUID(),
    slug: `t-${randomUUID().slice(0, 8)}`,
    disasterTypeKey: "t_storm",
    name: { es: "Emergencia de prueba" },
    defaultLocale: "es" as const,
    timeZone: "America/Santiago",
    comunas: ["Comuna Uno"],
    startedAt: "2026-10-09T14:30",
    area: null,
    ...overrides,
  };
}

async function newEmergency(overrides: Partial<Parameters<typeof createEmergency>[2]> = {}) {
  const input = emergencyInput(overrides);
  const result = await createEmergency(db, actorId, input);
  if (!result.ok) throw new Error(`emergency not created: ${result.code}`);
  return input;
}

async function settingsVersion(emergencyId: string) {
  const [row] = await db
    .select({ version: emergencySettings.version })
    .from(emergencySettings)
    .where(eq(emergencySettings.emergencyId, emergencyId));
  return row?.version ?? 0;
}

beforeAll(async () => {
  const [actor] = await db
    .insert(users)
    .values({ name: "Admin de prueba", email: "admin@example.test", platformRole: "admin" })
    .returning({ id: users.id });
  if (!actor) throw new Error("actor not created");
  actorId = actor.id;
  const created = await createDisasterType(db, actorId, {
    supplyTypes: [],
    key: "t_storm",
    name: { es: "Tormenta" },
    workTypes: [
      { key: "roof", name: { es: "Techo" } },
      { key: "debris", name: { es: "Escombros", en: "Debris" } },
    ],
  });
  expect(created.ok).toBe(true);
});

describe("seeds", () => {
  it("load once and leave admin edits alone when run again", async () => {
    await seedDatabase(db);
    const [seeded] = await db
      .select({ id: emergencies.id })
      .from(emergencies)
      .where(eq(emergencies.slug, "las-condes-2026"));
    if (!seeded) throw new Error("seed emergency missing");
    await db
      .update(emergencySettings)
      .set({ smsDailyCap: 42 })
      .where(eq(emergencySettings.emergencyId, seeded.id));

    await seedDatabase(db);

    const detail = await findEmergency(db, "las-condes-2026");
    expect(detail?.workTypeCount).toBeGreaterThan(0);
    expect(detail?.settings.smsDailyCap).toBe(42);
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emergencies)
      .where(eq(emergencies.slug, "las-condes-2026"));
    expect(count).toBe(1);
  });

  it("do not bring back a work type an admin removed from a seeded template", async () => {
    await seedDatabase(db);
    const seeded = await findDisasterType(db, "mudslide");
    if (!seeded) throw new Error("seeded type missing");
    const [, ...kept] = seeded.workTypes;
    await updateDisasterType(db, actorId, { ...seeded, workTypes: kept });

    await seedDatabase(db);

    expect((await findDisasterType(db, "mudslide"))?.workTypes).toEqual(kept);
  });
});

describe("disaster types", () => {
  it("rejects a key that already exists", async () => {
    const result = await createDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_storm",
      name: { es: "Otra" },
      workTypes: [{ key: "mud", name: { es: "Barro" } }],
    });
    expect(result).toEqual({ ok: false, code: "disaster_type_key_taken" });
  });

  it("replaces the template as a whole and refuses a stale version", async () => {
    await createDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_quake",
      name: { es: "Sismo" },
      workTypes: [{ key: "walls", name: { es: "Muros" } }],
    });
    const saved = await updateDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_quake",
      version: 1,
      name: { es: "Sismo fuerte" },
      workTypes: [
        { key: "roof", name: { es: "Techo" } },
        { key: "walls", name: { es: "Muros" } },
      ],
    });
    expect(saved).toEqual({ ok: true, data: { version: 2 } });
    const stale = await updateDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_quake",
      version: 1,
      name: { es: "Pisado" },
      workTypes: [{ key: "x1", name: { es: "X" } }],
    });
    expect(stale).toEqual({ ok: false, code: "stale_version" });

    const detail = await findDisasterType(db, "t_quake");
    expect(detail?.name).toEqual({ es: "Sismo fuerte" });
    expect(detail?.workTypes.map((w) => w.key)).toEqual(["roof", "walls"]);
  });

  it("lets exactly one of many concurrent edits of the same version win", async () => {
    await createDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_race",
      name: { es: "Carrera" },
      workTypes: [{ key: "a1", name: { es: "A" } }],
    });
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        updateDisasterType(db, actorId, {
          supplyTypes: [],
          key: "t_race",
          version: 1,
          name: { es: `Edición ${i}` },
          workTypes: [{ key: `k${i}`, name: { es: "K" } }],
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "stale_version")).toHaveLength(RACERS - 1);
    expect((await findDisasterType(db, "t_race"))?.workTypes).toHaveLength(1);
  });
});

describe("creating an emergency", () => {
  it("copies the template, converts the start from its zone and stores the area", async () => {
    const input = await newEmergency({ area: area(SQUARE) });
    const detail = await findEmergency(db, input.slug);
    expect(detail?.workTypeCount).toBe(2);
    expect(detail?.hasArea).toBe(true);
    // 14:30 in Santiago in October (UTC-3) is 17:30 UTC.
    expect(detail?.startedAt.toISOString()).toBe("2026-10-09T17:30:00.000Z");
    expect(detail?.settings.version).toBe(1);

    const [geometry] = await db
      .select({
        type: sql<string>`GeometryType(${emergencies.area})`,
        srid: sql<number>`ST_SRID(${emergencies.area})`,
      })
      .from(emergencies)
      .where(eq(emergencies.id, input.id));
    expect(geometry).toEqual({ type: "MULTIPOLYGON", srid: 4326 });

    const events = await db.select().from(adminEvents).where(eq(adminEvents.emergencyId, input.id));
    expect(events.map((e) => e.action)).toEqual(["emergency_created"]);
    expect(events[0]?.actorId).toBe(actorId);
  });

  it("answers success to a retry with the same id without a second emergency", async () => {
    const input = emergencyInput();
    const [first, retry] = [
      await createEmergency(db, actorId, input),
      await createEmergency(db, actorId, input),
    ];
    expect(first.ok && retry.ok).toBe(true);
    const copies = await db
      .select({ key: workTypes.key })
      .from(workTypes)
      .where(eq(workTypes.emergencyId, input.id));
    expect(copies).toHaveLength(2);
    const created = await db.select().from(adminEvents).where(eq(adminEvents.emergencyId, input.id));
    expect(created).toHaveLength(1);
  });

  it("copies the supply template too, so the report can ask for supplies", async () => {
    await createDisasterType(db, actorId, {
      key: "t_supplies",
      name: { es: "Con insumos" },
      workTypes: [{ key: "a1", name: { es: "A" } }],
      supplyTypes: [
        { key: "shovels", name: { es: "Palas" } },
        { key: "gloves", name: { es: "Guantes" } },
      ],
    });
    const input = await newEmergency({ disasterTypeKey: "t_supplies" });
    expect((await findEmergency(db, input.slug))?.supplyTypeCount).toBe(2);
  });

  it("answers a retry with the slug that was stored, even if the form changed it", async () => {
    const input = await newEmergency();
    expect(await createEmergency(db, actorId, { ...input, slug: "t-otro-slug" })).toEqual({
      ok: true,
      data: { slug: input.slug, created: false },
    });
  });

  it("maps what the database refuses to codes", async () => {
    const taken = await newEmergency();
    expect(await createEmergency(db, actorId, emergencyInput({ slug: taken.slug }))).toEqual({
      ok: false,
      code: "slug_taken",
    });
    expect(await createEmergency(db, actorId, emergencyInput({ area: area(BOWTIE) }))).toEqual({
      ok: false,
      code: "invalid_area",
    });
    expect(await createEmergency(db, actorId, emergencyInput({ disasterTypeKey: "t_missing" }))).toEqual({
      ok: false,
      code: "disaster_type_not_found",
    });
    await db.insert(disasterTypes).values({ key: "t_empty", name: { es: "Vacío" } });
    const empty = emergencyInput({ disasterTypeKey: "t_empty" });
    expect(await createEmergency(db, actorId, empty)).toEqual({ ok: false, code: "empty_work_catalog" });
    expect(await findEmergency(db, empty.slug)).toBeNull();
  });

  it("requires the name in the emergency's default language", () => {
    const parsed = emergencySchema.safeParse({ ...emergencyInput(), defaultLocale: "en", area: null });
    expect(parsed.success).toBe(false);
  });
});

describe("emergency settings", () => {
  const caps = {
    emergencyNumbers: [{ label: { es: "Ambulancia de prueba" }, phone: "000" }],
    smsDailyCap: 100,
    whatsappDailyCap: 50,
    neighborReserve: 10,
    officialContact: null,
    officialSurveyName: "Catastro",
  };

  it("lets exactly one of many concurrent saves of the same version win", async () => {
    const { id } = await newEmergency();
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        updateEmergencySettings(db, actorId, { emergencyId: id, version: 1, ...caps, smsDailyCap: i }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "stale_version")).toHaveLength(RACERS - 1);
    expect(await settingsVersion(id)).toBe(2);
  });

  it("saves the emergency numbers in their order", async () => {
    const { id, slug } = await newEmergency();
    const emergencyNumbers = [
      { label: { es: "Ambulancia de prueba" }, phone: "000" },
      { label: { es: "Bomberos de prueba" }, phone: "001" },
    ];
    expect(
      (await updateEmergencySettings(db, actorId, { emergencyId: id, version: 1, ...caps, emergencyNumbers }))
        .ok,
    ).toBe(true);
    expect((await findEmergency(db, slug))?.settings.emergencyNumbers).toEqual(emergencyNumbers);
  });

  it("refuses edits once the emergency is closed", async () => {
    const { id } = await newEmergency();
    expect((await closeEmergency(db, actorId, { emergencyId: id })).ok).toBe(true);
    expect(await updateEmergencySettings(db, actorId, { emergencyId: id, version: 1, ...caps })).toEqual({
      ok: false,
      code: "emergency_closed",
    });
    expect(
      await updateEmergencyArea(db, actorId, { emergencyId: id, version: 2, area: area(SQUARE) }),
    ).toEqual({
      ok: false,
      code: "emergency_closed",
    });
  });

  it("replaces the area only from the version that was read", async () => {
    const { id } = await newEmergency();
    expect(
      await updateEmergencyArea(db, actorId, { emergencyId: id, version: 1, area: area(SQUARE) }),
    ).toEqual({
      ok: true,
      data: { version: 2 },
    });
    expect(
      await updateEmergencyArea(db, actorId, { emergencyId: id, version: 1, area: area(SQUARE) }),
    ).toEqual({
      ok: false,
      code: "stale_version",
    });
  });
});

describe("closing an emergency", () => {
  it("lets exactly one of many concurrent closes win", async () => {
    const { id } = await newEmergency();
    const results = await Promise.all(
      Array.from({ length: RACERS }, () => closeEmergency(db, actorId, { emergencyId: id })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "already_closed")).toHaveLength(RACERS - 1);
    const closed = await db
      .select({ action: adminEvents.action })
      .from(adminEvents)
      .where(sql`${adminEvents.emergencyId} = ${id} and ${adminEvents.action} = 'emergency_closed'`);
    expect(closed).toHaveLength(1);
  });
});

describe("official notice", () => {
  it("publishes, replaces from the notice that was seen, and withdraws", async () => {
    const { id } = await newEmergency();
    const first = await publishNotice(db, actorId, {
      emergencyId: id,
      replacesId: null,
      message: { es: "Primero" },
    });
    if (!first.ok) throw new Error(first.code);
    expect(
      await publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { es: "Pisa" } }),
    ).toEqual({
      ok: false,
      code: "stale_version",
    });
    const second = await publishNotice(db, actorId, {
      emergencyId: id,
      replacesId: first.data.id,
      message: { es: "Segundo" },
    });
    if (!second.ok) throw new Error(second.code);
    expect((await findActiveNotice(db, id))?.message).toEqual({ es: "Segundo" });

    expect(await withdrawNotice(db, actorId, { emergencyId: id, noticeId: first.data.id })).toEqual({
      ok: false,
      code: "stale_version",
    });
    expect((await withdrawNotice(db, actorId, { emergencyId: id, noticeId: second.data.id })).ok).toBe(true);
    expect(await findActiveNotice(db, id)).toBeNull();
  });

  it("keeps one notice in force when admins publish at once", async () => {
    const { id } = await newEmergency();
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { es: `Aviso ${i}` } }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "stale_version")).toHaveLength(RACERS - 1);
  });

  it("must exist in the emergency's default language, and closing withdraws it", async () => {
    const { id } = await newEmergency();
    expect(
      await publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { en: "Only" } }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { message: "notice_required" },
    });
    expect(
      (await publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { es: "Aviso" } })).ok,
    ).toBe(true);
    await closeEmergency(db, actorId, { emergencyId: id });
    expect(await findActiveNotice(db, id)).toBeNull();
  });

  it("never stays in force when closing and publishing race", async () => {
    const { id } = await newEmergency();
    await Promise.all([
      closeEmergency(db, actorId, { emergencyId: id }),
      ...Array.from({ length: RACERS - 1 }, (_, i) =>
        publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { es: `Aviso ${i}` } }),
      ),
    ]);
    expect(await findActiveNotice(db, id)).toBeNull();
  });

  it("is not published on a closed emergency", async () => {
    const { id } = await newEmergency();
    await closeEmergency(db, actorId, { emergencyId: id });
    expect(
      await publishNotice(db, actorId, { emergencyId: id, replacesId: null, message: { es: "Tarde" } }),
    ).toEqual({
      ok: false,
      code: "emergency_closed",
    });
  });
});

describe("admin_events", () => {
  it("cannot be edited or deleted, only anonymized", async () => {
    const [event] = await db
      .insert(adminEvents)
      .values({ actorId, action: "test_action", targetType: "test", targetId: "x" })
      .returning({ id: adminEvents.id });
    if (!event) throw new Error("event not created");
    const edit = db.update(adminEvents).set({ action: "rewritten" }).where(eq(adminEvents.id, event.id));
    await expect(edit).rejects.toThrow();
    await expect(db.delete(adminEvents).where(eq(adminEvents.id, event.id))).rejects.toThrow();
    await expect(
      db.update(adminEvents).set({ actorId: null, targetId: null }).where(eq(adminEvents.id, event.id)),
    ).resolves.toBeDefined();
  });

  it("lets the person behind an event be deleted, keeping the action", async () => {
    const [person] = await db.insert(users).values({ name: "Se va" }).returning({ id: users.id });
    if (!person) throw new Error("user not created");
    const [event] = await db
      .insert(adminEvents)
      .values({ actorId: person.id, action: "test_action", targetType: "test" })
      .returning({ id: adminEvents.id });
    await db.delete(users).where(eq(users.id, person.id));
    const [kept] = await db
      .select()
      .from(adminEvents)
      .where(eq(adminEvents.id, event?.id ?? 0));
    expect(kept).toMatchObject({ actorId: null, action: "test_action" });
  });
});

describe("platform admins", () => {
  it("grants nobody when a phone is shared by two people", async () => {
    await db.insert(users).values([
      { name: "Uno", phone: "+56900000002" },
      { name: "Dos", phone: "+56900000002" },
    ]);
    expect(await grantPlatformAdmin(db, "+56900000002")).toEqual({ ok: false, code: "user_not_found" });
  });

  it("grants the role to an existing person by email or phone, never creating one", async () => {
    await db
      .insert(users)
      .values({ name: "Futura admin", email: "Futura@Example.test", phone: "+56900000001" });
    expect((await grantPlatformAdmin(db, "futura@example.test")).ok).toBe(true);
    expect((await grantPlatformAdmin(db, "+56900000001")).ok).toBe(true);
    expect(await grantPlatformAdmin(db, "nadie@example.test")).toEqual({ ok: false, code: "user_not_found" });
  });
});

describe("lists", () => {
  it("list disaster types with the same number of queries for 1 or 20 rows", async () => {
    await createDisasterType(db, actorId, {
      supplyTypes: [],
      key: "t_page_0",
      name: { es: "P" },
      workTypes: [{ key: "a1", name: { es: "A" } }],
    });
    counter.reset();
    await listDisasterTypes(db, { after: "t_page_" });
    const one = counter.count;

    const more = Array.from({ length: 19 }, (_, i) => `t_page_${i + 1}`);
    await db.insert(disasterTypes).values(more.map((key) => ({ key, name: { es: "P" } })));
    await db
      .insert(disasterTypeWorkTypes)
      .values(more.map((key) => ({ disasterTypeKey: key, key: "a1", name: { es: "A" } })));
    counter.reset();
    const page = await listDisasterTypes(db, { after: "t_page_" });
    expect(counter.count).toBe(one);
    expect(page.items.find((t) => t.key === "t_page_5")?.workTypeCount).toBe(1);
  });

  it("list every disaster type for a picker with one query per page", async () => {
    const keys = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => `t_all_${String(i).padStart(3, "0")}`);
    await db.insert(disasterTypes).values(keys.map((key) => ({ key, name: { es: "T" } })));
    const total = await db.$count(disasterTypes);
    counter.reset();
    const all = await listAllDisasterTypes(db);
    expect(all).toHaveLength(total);
    expect(new Set(all.map((t) => t.key)).size).toBe(total);
    expect(counter.count).toBe(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  });

  it("pages emergencies with a keyset cursor, without repeating rows", async () => {
    // Rows created in one transaction share now() up to the microsecond order, which is what
    // a millisecond cursor gets wrong.
    await db.transaction(async (tx) => {
      await tx.insert(emergencies).values(
        Array.from({ length: PAGE_SIZE + 10 }, (_, i) => ({
          slug: `t-page-${i}`,
          disasterTypeKey: "t_storm",
          name: { es: `Página ${i}` },
          defaultLocale: "es",
          timeZone: "America/Santiago",
          startedAt: new Date("2026-10-09T12:00:00Z"),
        })),
      );
    });
    counter.reset();
    const first = await listEmergencies(db);
    const firstCount = counter.count;
    const seen = new Set(first.items.map((e) => e.id));
    // Following a cursor is sequential by nature: each page needs the previous one.
    async function follow(cursor: string | null): Promise<void> {
      if (!cursor) return;
      counter.reset();
      const next = await listEmergencies(db, { after: cursor });
      expect(counter.count).toBe(firstCount);
      for (const item of next.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      return follow(next.nextCursor);
    }
    await follow(first.nextCursor);
    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(emergencies);
    expect(seen.size).toBe(total);
  });
});

describe("area files", () => {
  it("turn a FeatureCollection into one MultiPolygon", () => {
    const text = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: JSON.parse(SQUARE) as unknown },
        { type: "Feature", geometry: JSON.parse(SQUARE) as unknown },
      ],
    });
    const parsed = JSON.parse(area(text)) as { type: string; coordinates: unknown[] };
    expect(parsed.type).toBe("MultiPolygon");
    expect(parsed.coordinates).toHaveLength(2);
  });

  it("reject what is not polygons, an open ring and an oversized file", () => {
    const openRing = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    });
    for (const text of ["nope", JSON.stringify({ type: "Point", coordinates: [0, 0] }), openRing]) {
      expect(areaSchema.safeParse(text).error?.issues[0]?.message).toBe("invalid_geojson");
    }
    expect(areaSchema.safeParse("x".repeat(900_001)).error?.issues[0]?.message).toBe("area_too_large");
  });
});
