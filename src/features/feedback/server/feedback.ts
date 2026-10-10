import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { emergencies, feedback } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, pageOf, PAGE_SIZE } from "@/shared/lib/pagination";

import type { FeedbackCategory, FeedbackInput } from "../schemas";

/**
 * Stores one piece of feedback. `emergencySlug` is where it was sent from; an unknown slug stores
 * it unlinked rather than refusing it, in the same statement.
 */
export async function createFeedback(
  db: Executor,
  input: FeedbackInput & { emergencySlug: string | null },
): Promise<void> {
  await db.insert(feedback).values({
    category: input.category,
    message: input.message,
    contact: input.contact,
    emergencyId: input.emergencySlug
      ? sql`(SELECT ${emergencies.id} FROM ${emergencies} WHERE ${emergencies.slug} = ${input.emergencySlug})`
      : null,
  });
}

export type FeedbackItem = {
  id: string;
  category: FeedbackCategory;
  message: string;
  contact: string | null;
  createdAt: Date;
  emergencySlug: string | null;
};

/** Feedback for platform admins, newest first, one query per page keyset-paged by (created_at, id). */
export async function listFeedback(
  db: Executor,
  { after }: { after?: string } = {},
): Promise<Page<FeedbackItem>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db
    .select({
      id: feedback.id,
      category: feedback.category,
      message: feedback.message,
      contact: feedback.contact,
      createdAt: feedback.createdAt,
      emergencySlug: emergencies.slug,
      // Postgres keeps microseconds and a JS Date does not; the cursor carries the exact text.
      cursorAt: sql<string>`${feedback.createdAt}::text`,
    })
    .from(feedback)
    .leftJoin(emergencies, eq(emergencies.id, feedback.emergencyId))
    .where(
      cursor
        ? sql`(${feedback.createdAt}, ${feedback.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`
        : undefined,
    )
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(PAGE_SIZE + 1);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursorAt, last.id));
  return {
    ...page,
    items: page.items.map((row) => ({
      id: row.id,
      category: row.category,
      message: row.message,
      contact: row.contact,
      createdAt: row.createdAt,
      emergencySlug: row.emergencySlug,
    })),
  };
}
