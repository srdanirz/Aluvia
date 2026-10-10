import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { feedbackFormSchema } from "@/features/feedback/schemas";
import { createFeedback, listFeedback } from "@/features/feedback/server/feedback";
import { feedback } from "@/shared/db/schema";
import { PAGE_SIZE } from "@/shared/lib/pagination";

import { createTestDb } from "./setup/db";
import { createEmergency } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

let emergencyId: string;

beforeAll(async () => {
  emergencyId = await createEmergency(db, "feedback-a");
});

describe("feedback", () => {
  it("validates the form: message required up to 1000 chars, empty contact is none", () => {
    expect(feedbackFormSchema.safeParse({ category: "idea", message: "  ", contact: "" }).success).toBe(
      false,
    );
    expect(
      feedbackFormSchema.safeParse({ category: "idea", message: "x".repeat(1001), contact: "" }).success,
    ).toBe(false);
    expect(feedbackFormSchema.safeParse({ category: "bug", message: "Hola", contact: "" }).success).toBe(
      false,
    );
    expect(feedbackFormSchema.parse({ category: "other", message: " Hola ", contact: " " })).toEqual({
      category: "other",
      message: "Hola",
      contact: null,
    });
  });

  it("links feedback to the emergency it came from, and stores an unknown slug unlinked", async () => {
    await createFeedback(db, {
      category: "problem",
      message: "Mensaje inventado con emergencia",
      contact: null,
      emergencySlug: "feedback-a",
    });
    await createFeedback(db, {
      category: "idea",
      message: "Mensaje inventado sin emergencia",
      contact: null,
      emergencySlug: "no-such-emergency",
    });
    const rows = await db
      .select({ message: feedback.message, emergencyId: feedback.emergencyId })
      .from(feedback)
      .where(sql`${feedback.message} LIKE 'Mensaje inventado%'`);
    expect(rows).toEqual(
      expect.arrayContaining([
        { message: "Mensaje inventado con emergencia", emergencyId },
        { message: "Mensaje inventado sin emergencia", emergencyId: null },
      ]),
    );
  });

  it("refuses a message over 1000 chars in the database too", async () => {
    await expect(
      db.insert(feedback).values({ category: "other", message: "x".repeat(1001) }),
    ).rejects.toThrow();
  });

  it("pages newest first by cursor without gaps or repeats, one query per page", async () => {
    await db.delete(feedback);
    // One transaction: every row shares created_at, so only the id breaks ties (AI_PITFALLS).
    await db.transaction(async (tx) => {
      await tx.insert(feedback).values(
        Array.from({ length: PAGE_SIZE + 5 }, (_, index) => ({
          emergencyId,
          category: "idea" as const,
          message: `Idea inventada ${index}`,
          contact: index === 0 ? "correo@ejemplo.invalid" : null,
        })),
      );
    });

    counter.reset();
    const first = await listFeedback(db);
    expect(counter.count).toBe(1);
    counter.reset();
    const second = await listFeedback(db, { after: first.nextCursor ?? undefined });
    expect(counter.count).toBe(1);

    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(PAGE_SIZE + 5);
    expect(first.items[0]).toMatchObject({ emergencySlug: "feedback-a", category: "idea" });
  });
});
