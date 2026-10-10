import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";
import { matchLocale } from "@/shared/i18n/messages";

import { NOTIFICATION_TYPES, isNotificationType } from "../catalog";

// Every notice links to /n/<id>: short enough for a one-segment SMS (ADR 0010), and opening it is
// what "read" means (ADR 0007), whatever the channel.
export const notificationLink = (appUrl: string, notificationId: string) => `${appUrl}/n/${notificationId}`;

/** The page a notice is about, under the recipient's locale. Null when the catalog no longer has it. */
export function notificationPath(input: {
  type: string;
  payload: Record<string, string>;
  locale: string;
  slug: string;
}): string | null {
  if (!isNotificationType(input.type)) return null;
  const parsed = NOTIFICATION_TYPES[input.type].params.safeParse(input.payload);
  if (!parsed.success) return null;
  const path = NOTIFICATION_TYPES[input.type].path(parsed.data as never);
  return `/${input.locale}/emergencies/${input.slug}${path ? `/${path}` : ""}`;
}

/**
 * Follows a notice's link: marks it read if it was sent, so its SMS or WhatsApp fallback does not
 * go out, and returns where to send the person. One statement. The answer for an unknown id is
 * null, the same as for a stale one, so the link says nothing about which ids exist. The id is
 * the only credential: it reaches only the recipient, and all it reveals is a public page.
 */
export async function openNotification(db: Executor, id: string, now: Date): Promise<string | null> {
  const [row] = await db.execute<{
    type: string;
    payload: Record<string, string>;
    slug: string;
    defaultLocale: string;
    locale: string | null;
  }>(sql`
    WITH marked AS (
      UPDATE notifications SET read_at = ${now.toISOString()}
      WHERE id = ${id} AND sent_at IS NOT NULL AND read_at IS NULL
    )
    SELECT n.type, n.payload, e.slug, e.default_locale AS "defaultLocale", COALESCE(u.locale, c.locale) AS locale
    FROM notifications n
    JOIN emergencies e ON e.id = n.emergency_id
    LEFT JOIN users u ON u.id = n.user_id
    LEFT JOIN worksite_contacts c ON c.worksite_id = n.worksite_id
    WHERE n.id = ${id}`);
  if (!row) return null;
  return notificationPath({ ...row, locale: matchLocale(row.locale, row.defaultLocale) });
}
