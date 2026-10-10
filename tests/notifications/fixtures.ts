import { randomInt, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ChannelAdapters, ChannelResult, Delivery } from "@/features/notifications/channels/types";
import {
  disasterTypes,
  emergencies,
  emergencySettings,
  notificationPreferences,
  pushSubscriptions,
  users,
  worksiteContacts,
  worksites,
} from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";

// Invented data only (SECURITY.md): reserved-looking numbers and example.org addresses.
export const APP_URL = "https://aluvia.example.org";

// Random so files sharing the database never collide on a unique phone.
const inventedPhone = () => `+569${String(randomInt(1e8)).padStart(8, "0")}`;

export function createFixtures(db: Database) {
  let counter = 0;
  const next = () => (counter += 1);

  return {
    async emergency(options: { smsCap?: number; whatsappCap?: number; reserve?: number } = {}) {
      await db
        .insert(disasterTypes)
        .values({ key: "test_notify", name: { es: "Prueba" } })
        .onConflictDoNothing();
      const [row] = await db
        .insert(emergencies)
        .values({
          slug: `notify-${randomUUID().slice(0, 8)}`,
          disasterTypeKey: "test_notify",
          name: { es: "Prueba" },
          defaultLocale: "es",
          timeZone: "America/Santiago",
          startedAt: new Date("2026-10-08T12:00:00Z"),
        })
        .returning({ id: emergencies.id, slug: emergencies.slug });
      if (!row) throw new Error("emergency not created");
      await db.insert(emergencySettings).values({
        emergencyId: row.id,
        smsDailyCap: options.smsCap ?? 100,
        whatsappDailyCap: options.whatsappCap ?? 100,
        neighborReserve: options.reserve ?? 0,
      });
      return row;
    },

    async user(
      options: {
        channels?: ("push" | "email" | "sms" | "whatsapp")[];
        push?: number;
        locale?: string;
        quietHours?: boolean;
      } = {},
    ) {
      const n = next();
      const [row] = await db
        .insert(users)
        .values({
          name: `Volunteer ${n}`,
          email: `volunteer${n}-${randomUUID().slice(0, 6)}@example.org`,
          phone: inventedPhone(),
          locale: options.locale ?? null,
        })
        .returning({ id: users.id, phone: users.phone });
      if (!row) throw new Error("user not created");
      if (options.channels || options.quietHours !== undefined) {
        await db.insert(notificationPreferences).values({
          userId: row.id,
          channels: options.channels ?? ["push"],
          quietHours: options.quietHours ?? true,
        });
      }
      const pushCount = options.push ?? 0;
      if (pushCount > 0) {
        await db.insert(pushSubscriptions).values(
          Array.from({ length: pushCount }, () => ({
            userId: row.id,
            endpoint: `https://push.example.org/${randomUUID()}`,
            keys: { p256dh: "test-key", auth: "test-auth" },
          })),
        );
      }
      return { id: row.id, phone: row.phone! };
    },

    async neighbor(emergencyId: string, channel: "sms" | "whatsapp" | null = "sms", locale = "es") {
      const id = randomUUID();
      await db
        .insert(worksites)
        .values({ id, emergencyId, location: { x: -70.5, y: -33.4 }, source: "neighbor" });
      await db.insert(worksiteContacts).values({
        worksiteId: id,
        phone: inventedPhone(),
        locale,
        notifyChannel: channel,
        notifyConsentAt: channel ? new Date("2026-10-09T12:00:00Z") : null,
      });
      return id;
    },
  };
}

/** Closes every pending row, so a test only sees the notices it enqueued. */
export async function closePendingNotifications(db: Database) {
  await db.execute(sql`
    UPDATE notifications SET failed_at = now(), failure_code = 'test_isolation', claimed_at = NULL
    WHERE sent_at IS NULL AND failed_at IS NULL`);
}

type Recorder = { sent: Delivery[]; adapters: ChannelAdapters };

/** Adapters that record every delivery and answer with `respond`, after an optional delay. */
export function fakeAdapters(
  respond: (delivery: Delivery) => ChannelResult = () => ({ ok: true }),
  delayMs = 0,
): Recorder {
  const sent: Delivery[] = [];
  const send = async (delivery: Delivery) => {
    sent.push(delivery);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return respond(delivery);
  };
  return { sent, adapters: { push: { send }, email: { send }, sms: { send }, whatsapp: { send } } };
}
