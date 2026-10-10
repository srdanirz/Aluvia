import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { postgresErrorOf, UNIQUE_VIOLATION } from "@/shared/db/errors";
import { adminEvents, emergencies, emergencyNotices } from "@/shared/db/schema";
import type { LocalizedText } from "@/shared/db/schema/types";
import type { Database, Executor } from "@/shared/db/types";

import type { Result } from "../result";
import type { NoticeInput, NoticeWithdrawal } from "../schemas";

export type ActiveNotice = { id: string; message: LocalizedText; publishedAt: Date };

/**
 * The official notice in force for an emergency, or null. Public: the map and the report show
 * it to anyone. Read the message with readLocalizedText and the emergency's default locale.
 */
export async function findActiveNotice(db: Executor, emergencyId: string): Promise<ActiveNotice | null> {
  const [notice] = await db
    .select({
      id: emergencyNotices.id,
      message: emergencyNotices.message,
      publishedAt: emergencyNotices.publishedAt,
    })
    .from(emergencyNotices)
    .where(and(eq(emergencyNotices.emergencyId, emergencyId), isNull(emergencyNotices.withdrawnAt)));
  return notice ?? null;
}

/**
 * The notice in force for an emergency by its slug, already in the viewer's language (else the
 * emergency's default). For public pages that know only the slug, so it reads in parallel with
 * the rest of the page.
 */
export async function findActiveNoticeText(
  db: Executor,
  slug: string,
  locale: string,
): Promise<string | null> {
  const [notice] = await db
    .select({
      text: sql<string>`coalesce(${emergencyNotices.message} ->> ${locale}, ${emergencyNotices.message} ->> ${emergencies.defaultLocale})`,
    })
    .from(emergencyNotices)
    .innerJoin(emergencies, eq(emergencies.id, emergencyNotices.emergencyId))
    .where(and(eq(emergencies.slug, slug), isNull(emergencyNotices.withdrawnAt)));
  return notice?.text ?? null;
}

/**
 * Publishes a notice, withdrawing the one the admin was looking at (`replacesId`). If someone
 * else changed the notice in between, nothing is written and the answer is `stale_version`.
 */
export async function publishNotice(
  db: Database,
  actorId: string,
  { emergencyId, replacesId, message }: NoticeInput,
): Promise<Result<{ id: string }>> {
  try {
    return await db.transaction(async (tx) => {
      // Shared lock on the emergency: closing it waits for this publish, and the reverse.
      const [emergency] = await tx
        .select({ status: emergencies.status, defaultLocale: emergencies.defaultLocale })
        .from(emergencies)
        .where(eq(emergencies.id, emergencyId))
        .for("share");
      if (!emergency) return { ok: false, code: "not_found" };
      if (emergency.status === "closed") return { ok: false, code: "emergency_closed" };
      // Readers fall back to the emergency's default language, so the notice must exist in it.
      if (!message[emergency.defaultLocale]) {
        return { ok: false, code: "invalid_input", fieldErrors: { message: "notice_required" } };
      }

      if (replacesId) {
        const [withdrawn] = await tx
          .update(emergencyNotices)
          .set({ withdrawnAt: sql`now()` })
          .where(
            and(
              eq(emergencyNotices.id, replacesId),
              eq(emergencyNotices.emergencyId, emergencyId),
              isNull(emergencyNotices.withdrawnAt),
            ),
          )
          .returning({ id: emergencyNotices.id });
        if (!withdrawn) return { ok: false, code: "stale_version" };
      }

      const [published] = await tx
        .insert(emergencyNotices)
        .values({ emergencyId, message, publishedBy: actorId })
        .returning({ id: emergencyNotices.id });
      if (!published) throw new Error("insert returned no row");

      await tx.insert(adminEvents).values({
        actorId,
        action: "emergency_notice_published",
        targetType: "emergency_notice",
        targetId: published.id,
        emergencyId,
        payload: { replacesId },
      });
      return { ok: true, data: published };
    });
  } catch (error) {
    // Another admin published first while this one saw no notice: same answer as a stale edit.
    const pg = postgresErrorOf(error);
    if (pg?.code === UNIQUE_VIOLATION && pg.constraint === "emergency_notices_active_idx") {
      return { ok: false, code: "stale_version" };
    }
    throw error;
  }
}

/** Takes the notice down. Withdrawing one that is no longer in force answers `stale_version`. */
export async function withdrawNotice(
  db: Database,
  actorId: string,
  { emergencyId, noticeId }: NoticeWithdrawal,
): Promise<Result<null>> {
  return db.transaction(async (tx) => {
    const [withdrawn] = await tx
      .update(emergencyNotices)
      .set({ withdrawnAt: sql`now()` })
      .where(
        and(
          eq(emergencyNotices.id, noticeId),
          eq(emergencyNotices.emergencyId, emergencyId),
          isNull(emergencyNotices.withdrawnAt),
        ),
      )
      .returning({ id: emergencyNotices.id });
    if (!withdrawn) return { ok: false, code: "stale_version" };

    await tx.insert(adminEvents).values({
      actorId,
      action: "emergency_notice_withdrawn",
      targetType: "emergency_notice",
      targetId: noticeId,
      emergencyId,
    });
    return { ok: true, data: null };
  });
}
