import { randomUUID } from "node:crypto";

import { count, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createWorksites, newWorksiteSchema, submitWorksiteReport } from "@/features/worksites/server";
import { reportReceipts, workItemEvents, workItems, worksiteContacts, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

const RACERS = 8;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

// Invented points in open countryside; about 11 m per 0.0001 degree of latitude.
const ORIGIN = { lng: -70.6, lat: -33.5 };
const north = (meters: number) => ({ lng: ORIGIN.lng, lat: ORIGIN.lat + meters / 111_320 });

const home = (overrides: Record<string, unknown> = {}) =>
  newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location: ORIGIN,
    workTypeKeys: ["mud"],
    ...overrides,
  });

let slugs = 0;
const newEmergency = () => createEmergency(db, `attach-${++slugs}`);

async function importParcel(emergencyId: string, overrides: Record<string, unknown> = {}) {
  const parcel = home({ workTypeKeys: [], contact: { addressText: "Calle Inventada 100" }, ...overrides });
  await createWorksites(db, { emergencyId, source: "official", reports: [parcel] });
  return parcel.id;
}

const submit = (emergencyId: string, report: ReturnType<typeof home>) =>
  submitWorksiteReport(db, { emergencyId, source: "neighbor", report });

async function workItemCount(worksiteId: string) {
  const [row] = await db.select({ n: count() }).from(workItems).where(eq(workItems.worksiteId, worksiteId));
  return row?.n ?? 0;
}

async function homeCount(ids: string[]) {
  const [row] = await db.select({ n: count() }).from(worksites).where(inArray(worksites.id, ids));
  return row?.n ?? 0;
}

describe("a report next to an official parcel", () => {
  it("attaches to the parcel: its work, the reporter's contact and source, the official address kept", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const report = home({
      location: north(8),
      workTypeKeys: ["mud", "water"],
      hazards: ["gas"],
      isPersonInDanger: true,
      contact: {
        name: "Vecina de prueba",
        phone: "+56900000001",
        addressText: "Otra calle 1",
        notes: "Entró barro",
        notifyChannel: "sms",
      },
    });

    expect(await submit(emergencyId, report)).toEqual({
      ok: true,
      worksiteId: parcelId,
      outcome: "attached",
    });

    expect(await homeCount([report.id])).toBe(0);
    expect(await workItemCount(parcelId)).toBe(2);
    const [events] = await db
      .select({ n: count() })
      .from(workItemEvents)
      .innerJoin(workItems, eq(workItems.id, workItemEvents.workItemId))
      .where(eq(workItems.worksiteId, parcelId));
    expect(events?.n).toBe(2);

    const [parcel] = await db
      .select({
        source: worksites.source,
        version: worksites.version,
        waiting: worksites.unclaimedSince,
        hazards: worksites.hazards,
        flags: worksites.reviewFlags,
      })
      .from(worksites)
      .where(eq(worksites.id, parcelId));
    expect(parcel).toMatchObject({
      source: "neighbor",
      version: 1,
      hazards: ["gas"],
      flags: ["person_in_danger"],
    });
    expect(parcel?.waiting).toBeInstanceOf(Date);

    const [contact] = await db
      .select()
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, parcelId));
    expect(contact).toMatchObject({
      addressText: "Calle Inventada 100",
      name: "Vecina de prueba",
      phone: "+56900000001",
      notes: "Entró barro",
      notifyChannel: "sms",
    });
    expect(contact?.notifyConsentAt).toBeInstanceOf(Date);
  });

  it("takes the reporter's address when the parcel had none, and picks the nearest parcel", async () => {
    const emergencyId = await newEmergency();
    await importParcel(emergencyId, { location: ORIGIN });
    const nearest = await importParcel(emergencyId, { location: north(12), contact: {} });
    const report = home({ location: north(10), contact: { addressText: "Calle Inventada 112" } });

    expect(await submit(emergencyId, report)).toEqual({ ok: true, worksiteId: nearest, outcome: "attached" });
    const [contact] = await db
      .select()
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, nearest));
    expect(contact?.addressText).toBe("Calle Inventada 112");
  });

  it("creates its own home beyond the radius, next to a parcel that already has work, or on an imprecise fix", async () => {
    const emergencyId = await newEmergency();
    const far = await importParcel(emergencyId, { location: ORIGIN });
    const busy = home({ location: north(200), workTypeKeys: ["mud"] });
    await createWorksites(db, { emergencyId, source: "official", reports: [busy] });
    const vague = await importParcel(emergencyId, { location: north(400) });

    const beyond = home({ location: north(25) });
    const nextToBusy = home({ location: north(205) });
    const imprecise = home({ location: north(402), locationAccuracyMeters: 500 });
    const created = (report: ReturnType<typeof home>) => ({
      ok: true,
      worksiteId: report.id,
      outcome: "created",
    });
    expect(await submit(emergencyId, beyond)).toEqual(created(beyond));
    expect(await submit(emergencyId, nextToBusy)).toEqual(created(nextToBusy));
    expect(await submit(emergencyId, imprecise)).toEqual(created(imprecise));
    expect(await workItemCount(far)).toBe(0);
    expect(await workItemCount(busy.id)).toBe(1);
    expect(await workItemCount(vague)).toBe(0);
  });

  it("never attaches to another emergency's parcel", async () => {
    const emergencyId = await newEmergency();
    const otherId = await newEmergency();
    const parcel = await importParcel(otherId);
    const report = home({ location: north(3) });
    expect(await submit(emergencyId, report)).toEqual({
      ok: true,
      worksiteId: report.id,
      outcome: "created",
    });
    expect(await workItemCount(parcel)).toBe(0);
  });
});

describe("retries", () => {
  it("answers the same parcel to a retry and writes nothing twice", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const report = home({ location: north(5) });

    await submit(emergencyId, report);
    expect(await submit(emergencyId, report)).toEqual({ ok: true, worksiteId: parcelId, outcome: "retry" });
    expect(await workItemCount(parcelId)).toBe(1);
    expect(await homeCount([report.id])).toBe(0);
  });

  it("attaches once when the same report races itself", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const report = home({ location: north(5) });

    const results = await Promise.all(Array.from({ length: RACERS }, () => submit(emergencyId, report)));
    expect(results.every((r) => r.ok && r.worksiteId === parcelId)).toBe(true);
    expect(results.filter((r) => r.ok && r.outcome === "attached")).toHaveLength(1);
    expect(await workItemCount(parcelId)).toBe(1);
    expect(await homeCount([report.id])).toBe(0);
    const [receipts] = await db
      .select({ n: count() })
      .from(reportReceipts)
      .where(eq(reportReceipts.id, report.id));
    expect(receipts?.n).toBe(1);
  });

  it("does not attach a send whose id is already a home from before receipts", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const report = home({ location: north(5) });
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [report] });

    expect(await submit(emergencyId, report)).toEqual({ ok: true, worksiteId: report.id, outcome: "retry" });
    expect(await workItemCount(parcelId)).toBe(0);
    expect(await workItemCount(report.id)).toBe(1);
  });

  it("answers its own id and writes nothing when the id is another emergency's receipt", async () => {
    const otherId = await newEmergency();
    const otherParcel = await importParcel(otherId);
    const report = home({ location: north(5) });
    await submit(otherId, report);

    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    expect(await submit(emergencyId, report)).toEqual({ ok: true, worksiteId: report.id, outcome: "retry" });
    expect(await workItemCount(parcelId)).toBe(0);
    expect(await workItemCount(otherParcel)).toBe(1);
    expect(await homeCount([report.id])).toBe(0);
  });
});

describe("attach edge cases", () => {
  it("leaves the parcel untouched when a need is not in the catalog", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const report = home({
      location: north(4),
      workTypeKeys: ["rockets"],
      contact: { name: "Vecino de prueba" },
    });

    expect(await submit(emergencyId, report)).toEqual({ ok: false, code: "invalid_work_type" });
    const [parcel] = await db
      .select({ source: worksites.source, version: worksites.version })
      .from(worksites)
      .where(eq(worksites.id, parcelId));
    expect(parcel).toEqual({ source: "official", version: 0 });
    const [contact] = await db
      .select()
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, parcelId));
    expect(contact?.name).toBeNull();
    const [receipts] = await db
      .select({ n: count() })
      .from(reportReceipts)
      .where(eq(reportReceipts.id, report.id));
    expect(receipts?.n).toBe(0);
  });

  it("keeps the parcel's phone and consent when the reporter brings no phone", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId, {
      locale: "en",
      contact: { addressText: "Calle Inventada 100", phone: "+56900000002", notifyChannel: "whatsapp" },
    });
    const report = home({ location: north(4), contact: { name: "Vecino de prueba" } });

    expect(await submit(emergencyId, report)).toMatchObject({ worksiteId: parcelId, outcome: "attached" });
    const [contact] = await db
      .select()
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, parcelId));
    expect(contact).toMatchObject({
      name: "Vecino de prueba",
      phone: "+56900000002",
      notifyChannel: "whatsapp",
      locale: "en",
    });
    expect(contact?.notifyConsentAt).toBeInstanceOf(Date);
  });

  it("flags the parcel as a possible duplicate when a reported home already sits next to it", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId, { location: north(15) });
    // An imprecise fix does not attach, so it leaves a home of its own 5 m from the parcel.
    const nearby = home({ location: north(10), locationAccuracyMeters: 500 });
    expect(await submit(emergencyId, nearby)).toMatchObject({ worksiteId: nearby.id, outcome: "created" });
    expect(await submit(emergencyId, home({ location: north(18) }))).toMatchObject({
      worksiteId: parcelId,
      outcome: "attached",
    });

    const [parcel] = await db
      .select({ flags: worksites.reviewFlags })
      .from(worksites)
      .where(eq(worksites.id, parcelId));
    expect(parcel?.flags).toEqual(["possible_duplicate"]);
  });
});

describe("concurrent reports near one parcel", () => {
  it("attaches exactly one; the others create their own homes and the parcel's work is not doubled", async () => {
    const emergencyId = await newEmergency();
    const parcelId = await importParcel(emergencyId);
    const reports = Array.from({ length: RACERS }, (_, i) => home({ location: north(i) }));

    const results = await Promise.all(reports.map((report) => submit(emergencyId, report)));
    expect(results.filter((r) => r.ok && r.outcome === "attached")).toEqual([
      { ok: true, worksiteId: parcelId, outcome: "attached" },
    ]);
    expect(results.filter((r) => r.ok && r.outcome === "created")).toHaveLength(RACERS - 1);
    expect(await workItemCount(parcelId)).toBe(1);
    expect(await homeCount(reports.map((r) => r.id))).toBe(RACERS - 1);
  });
});
