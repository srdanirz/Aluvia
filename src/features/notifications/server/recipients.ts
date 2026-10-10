import { inArray } from "drizzle-orm";

import {
  emergencies,
  notificationPreferences,
  pushSubscriptions,
  users,
  worksiteContacts,
} from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";
import type { PushTarget } from "@/shared/messaging/web-push";

import type { ClaimedNotification } from "./claim";

/**
 * Everything a batch needs to address and word its notices, read in five queries whatever the
 * batch size (STYLEGUIDE, N+1). Contacts are read only to send; they never leave this module's
 * caller, never reach a log or a metric.
 */
export async function loadRecipients(db: Database, batch: ClaimedNotification[]) {
  const userIds = unique(batch.map((n) => n.userId));
  const pushUserIds = unique(batch.filter((n) => n.channel === "push").map((n) => n.userId));
  const worksiteIds = unique(batch.map((n) => n.worksiteId));
  const emergencyIds = unique(batch.map((n) => n.emergencyId));

  const [userRows, preferenceRows, subscriptionRows, contactRows, emergencyRows] = await Promise.all([
    userIds.length === 0
      ? []
      : db
          .select({ id: users.id, email: users.email, phone: users.phone, locale: users.locale })
          .from(users)
          .where(inArray(users.id, userIds)),
    userIds.length === 0
      ? []
      : db
          .select({ userId: notificationPreferences.userId, channels: notificationPreferences.channels })
          .from(notificationPreferences)
          .where(inArray(notificationPreferences.userId, userIds)),
    pushUserIds.length === 0
      ? []
      : db
          .select({
            userId: pushSubscriptions.userId,
            endpoint: pushSubscriptions.endpoint,
            keys: pushSubscriptions.keys,
          })
          .from(pushSubscriptions)
          .where(inArray(pushSubscriptions.userId, pushUserIds)),
    worksiteIds.length === 0
      ? []
      : db
          .select({
            worksiteId: worksiteContacts.worksiteId,
            phone: worksiteContacts.phone,
            locale: worksiteContacts.locale,
            notifyChannel: worksiteContacts.notifyChannel,
          })
          .from(worksiteContacts)
          .where(inArray(worksiteContacts.worksiteId, worksiteIds)),
    db
      .select({
        id: emergencies.id,
        slug: emergencies.slug,
        defaultLocale: emergencies.defaultLocale,
        timeZone: emergencies.timeZone,
      })
      .from(emergencies)
      .where(inArray(emergencies.id, emergencyIds)),
  ]);

  const subscriptions = new Map<string, PushTarget[]>();
  for (const row of subscriptionRows) {
    subscriptions.set(row.userId, [
      ...(subscriptions.get(row.userId) ?? []),
      { endpoint: row.endpoint, keys: row.keys },
    ]);
  }
  return {
    users: new Map(userRows.map((u) => [u.id, u])),
    // No row means the defaults: push only (schema default of notification_preferences.channels).
    channels: new Map(preferenceRows.map((p) => [p.userId, p.channels])),
    subscriptions,
    contacts: new Map(contactRows.map((c) => [c.worksiteId, c])),
    emergencies: new Map(emergencyRows.map((e) => [e.id, e])),
  };
}

export type Recipients = Awaited<ReturnType<typeof loadRecipients>>;

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}
