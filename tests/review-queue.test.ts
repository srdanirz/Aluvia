import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { newWorksiteSchema } from "@/features/worksites/schemas";
import { createWorksites, listWorksitesToReview, REVIEW_PAGE_SIZE } from "@/features/worksites/server";
import { contactViews, users } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

let emergencyId: string;
let coordinatorId: string;

const home = (overrides: Record<string, unknown> = {}) =>
  newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location: { lng: -70.5 + Math.random() / 100, lat: -33.4 + Math.random() / 100 },
    workTypeKeys: ["mud"],
    ...overrides,
  });

beforeAll(async () => {
  emergencyId = await createEmergency(db, "review-a");
  const [user] = await db
    .insert(users)
    .values({ name: "Coordinadora de prueba" })
    .returning({ id: users.id });
  if (!user) throw new Error("no user");
  coordinatorId = user.id;
});

describe("review queue", () => {
  it("lists homes without a pin, flagged or with unreviewed hazards, and logs the contact views", async () => {
    const zone = await createEmergency(db, "review-kinds");
    const unplaced = home({ location: null, contact: { addressText: "Calle Inventada 21" } });
    const danger = home({ isPersonInDanger: true });
    const risky = home({ hazards: ["electricity"] });
    const fine = home();
    await createWorksites(db, {
      emergencyId: zone,
      source: "social",
      reports: [unplaced, danger, risky, fine],
    });

    const page = await listWorksitesToReview(db, {
      emergencyId: zone,
      viewerId: coordinatorId,
      cursor: null,
    });
    expect(page.items.map((item) => item.id).sort()).toEqual([unplaced.id, danger.id, risky.id].sort());
    expect(page.items.find((item) => item.id === risky.id)?.pendingHazards).toEqual(["electricity"]);
    expect(page.items.find((item) => item.id === danger.id)?.reviewFlags).toEqual(["person_in_danger"]);
    expect(page.nextCursor).toBeNull();

    const [views] = await db
      .select({ n: count() })
      .from(contactViews)
      .where(eq(contactViews.emergencyId, zone));
    expect(views?.n).toBe(1);
  });

  it("pages by cursor without gaps or repeats, at the same cost per page", async () => {
    const homes = Array.from({ length: REVIEW_PAGE_SIZE + 5 }, () =>
      home({ location: null, contact: { addressText: "Pasaje Inventado 4" } }),
    );
    await createWorksites(db, { emergencyId, source: "social", reports: homes });

    counter.reset();
    const first = await listWorksitesToReview(db, { emergencyId, viewerId: coordinatorId, cursor: null });
    const firstCost = counter.count;
    counter.reset();
    const second = await listWorksitesToReview(db, {
      emergencyId,
      viewerId: coordinatorId,
      cursor: first.nextCursor,
    });
    expect(counter.count).toBe(firstCost);

    expect(first.items).toHaveLength(REVIEW_PAGE_SIZE);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(homes.length);
    expect(ids.sort()).toEqual(homes.map((h) => h.id).sort());
  });

  it("reads a tampered cursor as the first page instead of failing", async () => {
    const tampered = Buffer.from("2026-10-10T00:00:00Z|not-a-uuid").toString("base64url");
    const page = await listWorksitesToReview(db, { emergencyId, viewerId: coordinatorId, cursor: tampered });
    expect(page.items.length).toBeGreaterThan(0);
  });
});
