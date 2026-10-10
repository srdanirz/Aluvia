import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { listMapCells } from "@/features/map/server/map-cells";
import { loadMapSummaryUncached } from "@/features/map/server/map-summary";
import { geocodeAddress } from "@/features/worksites/server/geocode-address";
import {
  createWorksites,
  listWorksitesToReview,
  newWorksiteSchema,
  submitWorksiteReport,
  worksiteReportSchema,
} from "@/features/worksites/server";
import { users, workItems, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

// The Geocoding API is a paid network call: every test decides what it answers.
vi.mock("@/features/worksites/server/geocode-address", () => ({ geocodeAddress: vi.fn() }));
const geocode = vi.mocked(geocodeAddress);

const { db, close } = createTestDb();
afterAll(close);

// Invented points in open countryside, inside the test area below; addresses are made up too.
const AREA = { west: -70.62, south: -33.52, east: -70.58, north: -33.48 };
const PARCEL_POINT = { lng: -70.6, lat: -33.5 };
const GEOCODED_POINT = { lng: -70.61, lat: -33.49 };
const BBOX = { west: -70.75, south: -33.55, east: -70.4, north: -33.3 };
const NOW = new Date("2026-10-10T21:00:00Z");

let slugs = 0;
let coordinatorId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ name: "Coordinadora de prueba" })
    .returning({ id: users.id });
  if (!user) throw new Error("no user");
  coordinatorId = user.id;
});

beforeEach(() => {
  geocode.mockReset();
  geocode.mockResolvedValue({ point: GEOCODED_POINT, outcome: "placed" });
});

async function newEmergency() {
  const slug = `address-${++slugs}`;
  const emergencyId = await createEmergency(db, slug);
  await db.execute(sql`
    UPDATE emergencies
    SET area = ST_Multi(ST_MakeEnvelope(${AREA.west}, ${AREA.south}, ${AREA.east}, ${AREA.north}, 4326)),
      comunas = ARRAY['Comuna Inventada']
    WHERE id = ${emergencyId}`);
  return { slug, emergencyId };
}

async function importParcel(emergencyId: string, addressText: string, location = PARCEL_POINT) {
  const parcel = newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location,
    workTypeKeys: [],
    contact: { addressText },
  });
  await createWorksites(db, { emergencyId, source: "official", reports: [parcel] });
  return parcel.id;
}

// What the form sends now: the written address, no point.
const formReport = (addressText: string, overrides: Record<string, unknown> = {}) =>
  worksiteReportSchema.parse({
    id: randomUUID(),
    locale: "es",
    workTypeKeys: ["mud"],
    contact: { addressText },
    ...overrides,
  });

const submit = (emergencyId: string, report: ReturnType<typeof formReport>) =>
  submitWorksiteReport(db, { emergencyId, source: "neighbor", report });

async function mapIds(slug: string) {
  const cells = await listMapCells({ slug, bbox: BBOX, zoom: 18, now: NOW }, db);
  return (cells?.items ?? []).flatMap((cell) => (cell.worksites ?? []).map((home) => home.id));
}

async function homeOf(id: string) {
  const [row] = await db
    .select({
      hasPoint: sql<boolean>`${worksites.location} IS NOT NULL`,
      flags: worksites.reviewFlags,
      source: worksites.source,
    })
    .from(worksites)
    .where(eq(worksites.id, id));
  return row;
}

describe("a report with only a written address (production 2026-10-10: 201 but nothing on the map)", () => {
  it("is placed by the geocoder and shows on the public map and in the summary", async () => {
    const { slug, emergencyId } = await newEmergency();
    const report = formReport("Calle Inventada 500, depto 3");

    expect(await submit(emergencyId, report)).toEqual({
      ok: true,
      worksiteId: report.id,
      outcome: "created",
    });

    expect(geocode).toHaveBeenCalledOnce();
    const [address, bias] = geocode.mock.calls[0] ?? [];
    expect(address).toBe("Calle Inventada 500, depto 3");
    expect(bias?.comunas).toEqual(["Comuna Inventada"]);
    expect(bias?.area?.west).toBeCloseTo(AREA.west);
    expect(bias?.area?.north).toBeCloseTo(AREA.north);
    expect(await homeOf(report.id)).toMatchObject({ hasPoint: true, flags: [] });
    expect(await mapIds(slug)).toContain(report.id);
    expect(await loadMapSummaryUncached(slug, db)).toEqual({ homes: 1, waiting: 1 });
  });

  it("without a geocoded point, is saved for review: flagged and first in the coordinators' queue", async () => {
    const { slug, emergencyId } = await newEmergency();
    geocode.mockResolvedValue({ point: null, outcome: "failed" });
    const report = formReport("Calle Inventada 77", {
      workTypeKeys: [],
      contact: { addressText: "Calle Inventada 77", notes: "Barro" },
    });

    expect(await submit(emergencyId, report)).toMatchObject({ ok: true, outcome: "created" });

    expect(await homeOf(report.id)).toMatchObject({ hasPoint: false, flags: ["imprecise_location"] });
    expect(await mapIds(slug)).not.toContain(report.id);
    const queue = await listWorksitesToReview(db, { emergencyId, viewerId: coordinatorId, cursor: null });
    expect(queue.items.find((item) => item.id === report.id)).toMatchObject({
      hasLocation: false,
      reviewFlags: ["imprecise_location"],
      addressText: "Calle Inventada 77",
    });
  });
});

describe("a written address that names an official parcel", () => {
  it("attaches to that parcel without calling the geocoder, however the street and number are written", async () => {
    const { slug, emergencyId } = await newEmergency();
    const parcelId = await importParcel(emergencyId, "LOS ALERCES INVENTADOS 1234");
    const report = formReport("Av. Los Alerces Inventados N° 1234, depto 5");

    expect(await submit(emergencyId, report)).toEqual({
      ok: true,
      worksiteId: parcelId,
      outcome: "attached",
    });

    expect(geocode).not.toHaveBeenCalled();
    expect(await homeOf(parcelId)).toMatchObject({ hasPoint: true, source: "neighbor" });
    const [items] = await db.select({ n: count() }).from(workItems).where(eq(workItems.worksiteId, parcelId));
    expect(items?.n).toBe(1);
    expect(await mapIds(slug)).toContain(parcelId);
  });

  it("does not guess between two parcels with the same street and number: it geocodes instead", async () => {
    const { emergencyId } = await newEmergency();
    await importParcel(emergencyId, "PASAJE INVENTADO 10");
    await importParcel(emergencyId, "Pasaje Inventado 10", { lng: -70.601, lat: -33.501 });
    const report = formReport("Pasaje Inventado 10");

    expect(await submit(emergencyId, report)).toEqual({
      ok: true,
      worksiteId: report.id,
      outcome: "created",
    });
    expect(geocode).toHaveBeenCalledOnce();
  });

  it("does not match a street without a number, nor a parcel of another emergency", async () => {
    const { emergencyId } = await newEmergency();
    const other = await newEmergency();
    await importParcel(other.emergencyId, "CALLE AJENA 5");
    await importParcel(emergencyId, "CALLE SIN NUMERO 9");

    const elsewhere = formReport("Calle Ajena 5");
    expect(await submit(emergencyId, elsewhere)).toMatchObject({
      worksiteId: elsewhere.id,
      outcome: "created",
    });
    const vague = formReport("Calle Sin Numero, frente a la plaza");
    expect(await submit(emergencyId, vague)).toMatchObject({ worksiteId: vague.id, outcome: "created" });
    expect(geocode).toHaveBeenCalledTimes(2);
  });
});

describe("retries", () => {
  it("answers the first outcome without calling the geocoder again", async () => {
    const { emergencyId } = await newEmergency();
    const report = formReport("Calle Inventada 900");
    await submit(emergencyId, report);
    expect(await submit(emergencyId, report)).toEqual({ ok: true, worksiteId: report.id, outcome: "retry" });
    expect(geocode).toHaveBeenCalledOnce();
  });
});
