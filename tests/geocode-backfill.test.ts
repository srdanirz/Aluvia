import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { geocodeAddress } from "@/features/worksites/server/geocode-address";
import { backfillWorksiteLocations } from "@/features/worksites/server/geocode-backfill";
import { createWorksites, newWorksiteSchema } from "@/features/worksites/server";
import { worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

// The Geocoding API is a paid network call: every test decides what it answers.
vi.mock("@/features/worksites/server/geocode-address", () => ({ geocodeAddress: vi.fn() }));
const geocode = vi.mocked(geocodeAddress);

const { db, close } = createTestDb();
afterAll(close);

// Invented points in open countryside and invented addresses.
const AREA = { west: -70.62, south: -33.52, east: -70.58, north: -33.48 };
const PARCEL_POINT = { lng: -70.6, lat: -33.5 };
const GEOCODED_POINT = { lng: -70.61, lat: -33.49 };

let slugs = 0;

beforeEach(() => {
  geocode.mockReset();
  geocode.mockResolvedValue({ point: GEOCODED_POINT, outcome: "placed" });
});

async function newEmergency() {
  const emergencyId = await createEmergency(db, `backfill-${++slugs}`);
  await db.execute(sql`
    UPDATE emergencies
    SET area = ST_Multi(ST_MakeEnvelope(${AREA.west}, ${AREA.south}, ${AREA.east}, ${AREA.north}, 4326))
    WHERE id = ${emergencyId}`);
  return emergencyId;
}

async function addHome(
  emergencyId: string,
  addressText: string,
  options: { source?: "neighbor" | "official"; location?: { lng: number; lat: number } } = {},
) {
  const home = newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    workTypeKeys: [],
    contact: { addressText },
    // The schema needs a point; addUnplacedHome clears it afterwards.
    location: options.location ?? GEOCODED_POINT,
  });
  await createWorksites(db, { emergencyId, source: options.source ?? "neighbor", reports: [home] });
  return home.id;
}

// A home saved before ADR 0016: written address, no point, waiting for a coordinator.
async function addUnplacedHome(emergencyId: string, addressText: string) {
  const id = await addHome(emergencyId, addressText);
  await db.execute(sql`
    UPDATE worksites SET location = NULL, review_flags = ARRAY['imprecise_location']::worksite_review_flag[]
    WHERE id = ${id}`);
  return id;
}

async function readHome(id: string) {
  const [row] = await db
    .select({
      lng: sql<number | null>`ST_X(${worksites.location})`,
      lat: sql<number | null>`ST_Y(${worksites.location})`,
      reviewFlags: worksites.reviewFlags,
      version: worksites.version,
    })
    .from(worksites)
    .where(eq(worksites.id, id));
  if (!row) throw new Error("no home");
  return row;
}

describe("backfillWorksiteLocations", () => {
  it("places a home by its official parcel first, without calling the geocoder", async () => {
    const emergencyId = await newEmergency();
    await addHome(emergencyId, "Calle Inventada 101", { source: "official", location: PARCEL_POINT });
    const id = await addUnplacedHome(emergencyId, "calle inventada 101, depto 2");
    const before = await readHome(id);

    const summary = await backfillWorksiteLocations(db, emergencyId);

    expect(geocode).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ placedByParcel: 1, placedByGeocoder: 0, updated: 1, remaining: 0 });
    const after = await readHome(id);
    // It now stands on the parcel: a coordinator compares the two, as for a new report nearby.
    expect(after).toMatchObject({
      lng: PARCEL_POINT.lng,
      lat: PARCEL_POINT.lat,
      reviewFlags: ["possible_duplicate"],
    });
    expect(after.version).toBe(before.version + 1);
  });

  it("geocodes a home with no parcel match and clears its imprecise flag", async () => {
    const emergencyId = await newEmergency();
    const id = await addUnplacedHome(emergencyId, "Pasaje Ficticio 202");

    const summary = await backfillWorksiteLocations(db, emergencyId);

    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode.mock.calls[0]?.[1].area).toEqual(AREA);
    expect(summary).toMatchObject({ placedByGeocoder: 1, updated: 1 });
    expect(await readHome(id)).toMatchObject({ ...GEOCODED_POINT, reviewFlags: [] });
  });

  it("leaves a home the geocoder cannot place as it was, and counts why", async () => {
    const emergencyId = await newEmergency();
    const id = await addUnplacedHome(emergencyId, "Camino Sin Numero");
    const before = await readHome(id);
    geocode.mockResolvedValue({ point: null, outcome: "imprecise" });

    const summary = await backfillWorksiteLocations(db, emergencyId);

    expect(summary).toMatchObject({ updated: 0, remaining: 1, notPlaced: { imprecise: 1 } });
    expect(await readHome(id)).toEqual(before);
  });

  it("is idempotent: a second run places nothing and calls nobody", async () => {
    const emergencyId = await newEmergency();
    const id = await addUnplacedHome(emergencyId, "Avenida Imaginaria 303");
    await backfillWorksiteLocations(db, emergencyId);
    const placed = await readHome(id);
    geocode.mockClear();

    const summary = await backfillWorksiteLocations(db, emergencyId);

    expect(geocode).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ candidates: 0, updated: 0 });
    expect(await readHome(id)).toEqual(placed);
  });

  it("returns counts only, never an address", async () => {
    const emergencyId = await newEmergency();
    await addUnplacedHome(emergencyId, "Calle Secreta 404");

    const summary = await backfillWorksiteLocations(db, emergencyId);

    expect(JSON.stringify(summary)).not.toContain("Secreta");
  });
});
