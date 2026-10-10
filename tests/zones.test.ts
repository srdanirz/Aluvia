import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { claimWorkItem } from "@/features/work-items/server";
import { insertZone, listActiveZones, removeZone } from "@/features/zones/server/zones";
import { emergencies } from "@/shared/db/schema";
import { eq } from "drizzle-orm";

import { createTestDb } from "./setup/db";
import { createEmergency, createUsers, createWorksite, NOW } from "./work-items/fixtures";

const { db, close } = createTestDb();
afterAll(close);

// A square of ~1 km around the fixture's default home at (-70.55, -33.41).
const AROUND_HOME: [number, number][] = [
  [-70.555, -33.415],
  [-70.545, -33.415],
  [-70.545, -33.405],
  [-70.555, -33.405],
];
const FAR_AWAY: [number, number][] = [
  [-70.6, -33.5],
  [-70.59, -33.5],
  [-70.59, -33.49],
];

async function slugOf(emergencyId: string) {
  const [row] = await db
    .select({ slug: emergencies.slug })
    .from(emergencies)
    .where(eq(emergencies.id, emergencyId));
  if (!row) throw new Error("emergency missing");
  return row.slug;
}

describe("emergency zones", () => {
  it("draws a zone once even when the save is retried, and removes it", async () => {
    const emergency = await createEmergency(db);
    const [actorId] = await createUsers(db, emergency.id, 1);
    const id = randomUUID();
    const zone = {
      id,
      emergencyId: emergency.id,
      kind: "restricted" as const,
      note: "Puente",
      ring: AROUND_HOME,
      actorId: actorId!,
    };

    await insertZone(db, zone);
    await insertZone(db, zone);
    const slug = await slugOf(emergency.id);
    const zones = await listActiveZones(db, slug);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ id, kind: "restricted", note: "Puente" });

    expect(await removeZone(db, { id, emergencyId: emergency.id, actorId: actorId! })).toBe(true);
    expect(await removeZone(db, { id, emergencyId: emergency.id, actorId: actorId! })).toBe(false);
    expect(await listActiveZones(db, slug)).toEqual([]);
  });

  it("blocks claiming work on a home inside a no-entry zone, and only there", async () => {
    const emergency = await createEmergency(db);
    const [volunteer, coordinator] = await createUsers(db, emergency.id, 2);
    const inside = await createWorksite(db, emergency.id);
    const zoneId = randomUUID();
    await insertZone(db, {
      id: zoneId,
      emergencyId: emergency.id,
      kind: "no_entry",
      note: null,
      ring: AROUND_HOME,
      actorId: coordinator!,
    });
    await insertZone(db, {
      id: randomUUID(),
      emergencyId: emergency.id,
      kind: "no_entry",
      note: null,
      ring: FAR_AWAY,
      actorId: coordinator!,
    });

    const blocked = await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: inside.workItemIds[0]!,
      userId: volunteer!,
      now: NOW,
    });
    expect(blocked.ok).toBe(false);

    await removeZone(db, { id: zoneId, emergencyId: emergency.id, actorId: coordinator! });
    const claimed = await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: inside.workItemIds[0]!,
      userId: volunteer!,
      now: NOW,
    });
    expect(claimed.ok).toBe(true);
  });
});
