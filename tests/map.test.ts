import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CELL_DEGREES } from "@/features/map/grid";
import { listMapCells } from "@/features/map/server/map-cells";
import { findMapEmergencyUncached } from "@/features/map/server/map-emergency";
import { findPublicWorksite } from "@/features/map/server/public-worksite";
import {
  disasterTypes,
  emergencies,
  emergencyMembers,
  emergencySettings,
  users,
  workItems,
  workTypes,
  worksiteContacts,
  worksites,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";

const { db, counter, close } = createTestDb();
afterAll(close);

const NOW = new Date("2026-10-10T12:00:00Z");
const HOUR = 60 * 60 * 1000;

// Invented coordinates in open ocean, far from any real address (SECURITY.md).
const ORIGIN = { x: -80.2, y: -40.1 };
const NEAR = { west: -80.3, south: -40.2, east: -80.1, north: -40.0 };
const STREET_ZOOM = 20;

type WorkItemSeed = {
  status?: (typeof workItems.$inferInsert)["status"];
  claimed?: boolean;
  updatedAt?: Date;
};

let emergencyId: string;
let otherEmergencyId: string;
let claimantId: string;

async function createEmergency(slug: string) {
  const [row] = await db
    .insert(emergencies)
    .values({
      slug,
      disasterTypeKey: "test_map_flood",
      name: { es: `Emergencia ${slug}`, en: `Emergency ${slug}` },
      defaultLocale: "es",
      timeZone: "America/Santiago",
      startedAt: NOW,
    })
    .returning({ id: emergencies.id });
  if (!row) throw new Error("emergency not created");
  // Only a member can hold a claim; the claimant joins every test emergency.
  await db.insert(emergencyMembers).values({ emergencyId: row.id, userId: claimantId });
  await db.insert(workTypes).values([
    { emergencyId: row.id, key: "mud", name: { es: "Barro", en: "Mud" }, sortOrder: 1 },
    { emergencyId: row.id, key: "water", name: { es: "Agua" }, sortOrder: 2 },
  ]);
  return row.id;
}

/** One home with its work items, inserted in two statements whatever the number of items. */
async function createHome(
  location: { x: number; y: number },
  items: WorkItemSeed[] = [],
  emergency = emergencyId,
  updatedAt = NOW,
): Promise<string> {
  const id = randomUUID();
  await db.insert(worksites).values({
    id,
    emergencyId: emergency,
    location,
    source: "neighbor",
    damageLevel: "severe",
    createdAt: updatedAt,
    updatedAt,
  });
  if (items.length > 0) {
    await db.insert(workItems).values(
      items.map((item, i) => ({
        id: randomUUID(),
        emergencyId: emergency,
        worksiteId: id,
        workTypeKey: i % 2 === 0 ? "mud" : "water",
        status: item.status ?? "open_unclaimed",
        claimedBy: item.claimed ? claimantId : null,
        updatedAt: item.updatedAt ?? updatedAt,
      })),
    );
  }
  return id;
}

/** A point inside the grid cell (cx, cy) counted from ORIGIN, at a fraction of the cell. */
function inCell(cx: number, cy: number, fraction = 0.3) {
  const baseX = Math.floor(ORIGIN.x / CELL_DEGREES) + cx;
  const baseY = Math.floor(ORIGIN.y / CELL_DEGREES) + cy;
  return { x: (baseX + fraction) * CELL_DEGREES, y: (baseY + fraction) * CELL_DEGREES };
}

beforeAll(async () => {
  await db.insert(disasterTypes).values({ key: "test_map_flood", name: { es: "Prueba" } });
  const [claimant] = await db
    .insert(users)
    .values({ name: "Voluntaria de prueba" })
    .returning({ id: users.id });
  if (!claimant) throw new Error("user not created");
  claimantId = claimant.id;
  otherEmergencyId = await createEmergency("map-other");
});

/** listMapCells for an emergency that exists: null would mean the slug is wrong. */
async function listCells(...args: Parameters<typeof listMapCells>) {
  const cells = await listMapCells(...args);
  if (!cells) throw new Error("emergency not found");
  expect(cells.truncated).toBe(false);
  return cells.items;
}

// Each test gets its own emergency, so counts never leak between tests.
let slug: string;
beforeEach(async () => {
  slug = `map-${randomUUID().slice(0, 8)}`;
  emergencyId = await createEmergency(slug);
});

describe("attention level", () => {
  it("is unattended with open work and nobody on it, or with no work yet", async () => {
    await createHome(inCell(0, 0), [{}, { status: "open_partially_done" }]);
    await createHome(inCell(2, 0));
    const cells = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells.map((c) => c.worksites?.[0]?.level)).toEqual(["unattended", "unattended"]);
  });

  it("is in progress when someone is on at least one open work item", async () => {
    await createHome(inCell(0, 0), [{}, { status: "open_claimed", claimed: true }]);
    const [cell] = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cell?.levels).toEqual({
      do_not_enter: 0,
      unattended: 0,
      unconfirmed: 0,
      no_request: 0,
      in_progress: 1,
      attended: 0,
    });
  });

  it("is to confirm when nothing moved for longer than the emergency's window", async () => {
    const stale = new Date(NOW.getTime() - 49 * HOUR);
    await createHome(inCell(0, 0), [{}], emergencyId, stale);
    // An old report whose work changed recently is still urgent.
    await createHome(inCell(2, 0), [{ updatedAt: new Date(NOW.getTime() - HOUR) }], emergencyId, stale);
    const cells = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells.map((c) => c.worksites?.[0]?.level).sort()).toEqual(["unattended", "unconfirmed"]);
  });

  it("uses the emergency's own stale window", async () => {
    await db.insert(emergencySettings).values({ emergencyId, staleAfterHours: 6 });
    await createHome(inCell(0, 0), [{}], emergencyId, new Date(NOW.getTime() - 7 * HOUR));
    const [cell] = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cell?.levels.unconfirmed).toBe(1);
  });

  // Official parcels nobody asked about stay off the map: thousands of them hid the homes in need.
  it("leaves out an official home without work", async () => {
    await db
      .insert(worksites)
      .values({ id: randomUUID(), emergencyId, location: inCell(0, 0), source: "official", updatedAt: NOW });
    const cells = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells).toEqual([]);
  });

  it("is do not enter while a reported hazard waits for review", async () => {
    await db.insert(worksites).values({
      id: randomUUID(),
      emergencyId,
      location: inCell(0, 0),
      source: "neighbor",
      hazards: ["gas"],
      updatedAt: NOW,
    });
    const [cell] = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cell?.worksites?.[0]?.level).toBe("do_not_enter");
  });

  it("is attended when every work item is closed", async () => {
    await createHome(inCell(0, 0), [{ status: "closed_done" }, { status: "closed_duplicate" }]);
    const [cell] = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cell?.levels).toEqual({
      do_not_enter: 0,
      unattended: 0,
      unconfirmed: 0,
      no_request: 0,
      in_progress: 0,
      attended: 1,
    });
  });
});

describe("listMapCells", () => {
  it("shows every home alone at its exact point at street zoom", async () => {
    const first = inCell(0, 0, 0.2);
    const second = inCell(0, 0, 0.7);
    await createHome(first, [{ status: "closed_done" }]);
    await createHome(second, [{}]);
    const cells = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells).toHaveLength(2);
    const points = cells.map((c) => [c.position.lng, c.position.lat]).sort(([a = 0], [b = 0]) => a - b);
    expect(points[0]?.[0]).toBeCloseTo(first.x, 9);
    expect(points[1]?.[0]).toBeCloseTo(second.x, 9);
    expect(cells.every((c) => c.count === 1 && c.worksites?.length === 1)).toBe(true);
  });

  it("merges neighboring cells when zoomed out at the average of its homes", async () => {
    await createHome(inCell(0, 0), [{}]);
    await createHome(inCell(1, 1), [{ status: "open_claimed", claimed: true }]);
    await createHome(inCell(2, 0), [{ status: "closed_done" }]);
    const [cell, ...rest] = await listCells({ slug, bbox: NEAR, zoom: 10, now: NOW }, db);
    expect(rest).toHaveLength(0);
    expect(cell?.count).toBe(3);
    expect(cell?.levels).toEqual({
      do_not_enter: 0,
      unattended: 1,
      unconfirmed: 0,
      no_request: 0,
      in_progress: 1,
      attended: 1,
    });
    expect(cell?.worksites).toBeNull();
    expect(cell?.position.lng).toBeCloseTo((inCell(0, 0).x + inCell(1, 1).x + inCell(2, 0).x) / 3, 9);
  });

  it("lists the homes of a group that sits in one block, most urgent first", async () => {
    const done = await createHome(inCell(0, 0, 0.2), [{ status: "closed_done" }]);
    const open = await createHome(inCell(0, 0, 0.7), [{}]);
    // Zoom 17 groups two blocks per side, so both homes share one group in a single block.
    const [cell] = await listCells({ slug, bbox: NEAR, zoom: 17, now: NOW }, db);
    expect(cell?.worksites).toEqual([
      { id: open, level: "unattended" },
      { id: done, level: "attended" },
    ]);
  });

  it("opens homes on the same point as one list instead of stacked markers", async () => {
    const point = inCell(0, 0, 0.4);
    const done = await createHome(point, [{ status: "closed_done" }]);
    const open = await createHome(point, [{}]);
    const [cell, ...rest] = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(rest).toHaveLength(0);
    expect(cell?.worksites).toEqual([
      { id: open, level: "unattended" },
      { id: done, level: "attended" },
    ]);
  });

  it("says so when street zoom has more points than one response carries", async () => {
    // 2001 homes on distinct points inside one bbox, inserted in one statement.
    await db.insert(worksites).values(
      Array.from({ length: 2001 }, (_, i) => ({
        id: randomUUID(),
        emergencyId,
        location: inCell(i % 50, Math.floor(i / 50), 0.5),
        source: "neighbor" as const,
        updatedAt: NOW,
      })),
    );
    const cells = await listMapCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells?.truncated).toBe(true);
    expect(cells?.items).toHaveLength(2000);
  });

  it("leaves homes without a point off the map", async () => {
    await db.insert(worksites).values({ id: randomUUID(), emergencyId, source: "neighbor", updatedAt: NOW });
    expect(await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db)).toEqual([]);
  });

  // Groups are whole cells: a bbox that cuts one answers for all of it, so groups never split.
  it("treats a bbox that cuts a cell as covering the whole cell", async () => {
    const point = inCell(0, 0, 0.8);
    await createHome(point);
    const sliver = CELL_DEGREES * 0.1;
    const missesPoint = {
      west: point.x - 7 * sliver,
      south: point.y - 7 * sliver,
      east: point.x - 6 * sliver,
      north: point.y - 6 * sliver,
    };
    const cells = await listCells({ slug, bbox: missesPoint, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells).toHaveLength(1);
  });

  it("only shows homes of the requested emergency", async () => {
    await createHome(inCell(0, 0), [{}], otherEmergencyId);
    expect(await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db)).toEqual([]);
  });

  it("is null for a slug that is not an emergency", async () => {
    expect(await listMapCells({ slug: "missing", bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db)).toBeNull();
  });

  it("issues one query whether the bbox holds 1 home or 20", async () => {
    await createHome(inCell(0, 0), [{}]);
    counter.reset();
    await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    const forOne = counter.count;

    await Promise.all(
      Array.from({ length: 19 }, (_, i) => createHome(inCell(i * 2, 5), [{}, { status: "closed_done" }])),
    );
    counter.reset();
    const cells = await listCells({ slug, bbox: NEAR, zoom: STREET_ZOOM, now: NOW }, db);
    expect(cells.reduce((sum, c) => sum + c.count, 0)).toBe(20);
    expect(counter.count).toBe(forOne);
    expect(forOne).toBe(1);
  });
});

describe("findPublicWorksite", () => {
  it("returns the public form with localized work types and no contact data", async () => {
    const id = await createHome(inCell(0, 0), [{}, { status: "closed_done" }]);
    await db
      .insert(worksiteContacts)
      .values({ worksiteId: id, name: "Nombre inventado", phone: "+56900000000" });

    const home = await findPublicWorksite({ slug, id, locale: "en", now: NOW }, db);
    expect(home?.position?.lng).toBeCloseTo(inCell(0, 0).x, 9);
    expect(home).toMatchObject({
      id,
      level: "unattended",
      damageLevel: "severe",
      workItems: [
        { workType: "Mud", status: "open_unclaimed" },
        // No English name: falls back to the emergency's default language.
        { workType: "Agua", status: "closed_done" },
      ],
    });
    const serialized = JSON.stringify(home);
    expect(serialized).not.toContain("Nombre inventado");
    expect(serialized).not.toContain("+56900000000");
  });

  it("has no position for a home reported with a written address only", async () => {
    const id = randomUUID();
    await db.insert(worksites).values({ id, emergencyId, source: "neighbor", updatedAt: NOW });
    const home = await findPublicWorksite({ slug, id, locale: "es", now: NOW }, db);
    expect(home?.position).toBeNull();
  });

  it("is null for a home of another emergency", async () => {
    const id = await createHome(inCell(0, 0), [], otherEmergencyId);
    expect(await findPublicWorksite({ slug, id, locale: "es", now: NOW }, db)).toBeNull();
  });
});

describe("findMapEmergencyUncached", () => {
  it("opens on its homes when it has no area, and is null for an unknown slug", async () => {
    const southWest = inCell(0, 0, 0.8);
    const northEast = inCell(3, 2, 0.8);
    await createHome(southWest);
    await createHome(northEast);
    const emergency = await findMapEmergencyUncached({ slug, locale: "en" }, db);
    expect(emergency?.name).toBe(`Emergency ${slug}`);
    expect(emergency?.bounds?.west).toBeCloseTo(southWest.x, 9);
    expect(emergency?.bounds?.south).toBeCloseTo(southWest.y, 9);
    expect(emergency?.bounds?.east).toBeCloseTo(northEast.x, 9);
    expect(emergency?.bounds?.north).toBeCloseTo(northEast.y, 9);
    expect(await findMapEmergencyUncached({ slug: "missing", locale: "es" }, db)).toBeNull();
  });

  it("returns its area as rings and opens on it, not on its homes", async () => {
    await createHome(inCell(500, 500));
    await db.execute(sql`
      UPDATE emergencies SET area = ST_GeomFromText('MULTIPOLYGON(((-80.2 -40.1, -80.1 -40.1, -80.1 -40.0, -80.2 -40.1)))', 4326)
      WHERE id = ${emergencyId}
    `);
    const emergency = await findMapEmergencyUncached({ slug, locale: "es" }, db);
    expect(emergency?.area?.[0]?.[0]).toHaveLength(4);
    expect(emergency?.area?.[0]?.[0]?.[0]).toEqual({ lat: -40.1, lng: -80.2 });
    expect(emergency?.bounds).toEqual({ west: -80.2, south: -40.1, east: -80.1, north: -40.0 });
  });
});
