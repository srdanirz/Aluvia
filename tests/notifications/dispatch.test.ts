import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { enqueueNotification } from "@/features/notifications";
import { LEASE_SECONDS, claimNotifications } from "@/features/notifications/server/claim";
import { dispatchNotifications } from "@/features/notifications/server/dispatch";
import { MAX_ATTEMPTS, recordOutcomes } from "@/features/notifications/server/outcomes";
import { findNotificationLink, markNotificationRead } from "@/features/notifications/server/links";
import { notificationDailyUsage, notifications, pushSubscriptions } from "@/shared/db/schema";

import { createTestDb } from "../setup/db";
import { APP_URL, closePendingNotifications, createFixtures, fakeAdapters } from "./fixtures";

// Two workers race with a few connections each.
const { db, counter, close } = createTestDb({ connections: 8 });
afterAll(close);
const fixtures = createFixtures(db);

// 15:00 in Santiago (UTC-3 in October): outside quiet hours.
const NOW = new Date("2026-10-12T18:00:00Z");
// 23:00 in Santiago: inside quiet hours.
const NIGHT = new Date("2026-10-13T02:00:00Z");
const SHIFT = { shiftId: "00000000-0000-4000-8000-000000000001", startsAt: "2026-10-13T12:00:00Z" };

function dispatch(adapters: ReturnType<typeof fakeAdapters>["adapters"], now = NOW, batchSize?: number) {
  return dispatchNotifications({
    db,
    adapters,
    appUrl: APP_URL,
    clock: () => now,
    deadline: new Date(now.getTime() + 60_000),
    batchSize,
  });
}

async function rowsFor(eventKey: string) {
  return db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      userId: notifications.userId,
      worksiteId: notifications.worksiteId,
      notBefore: notifications.notBefore,
      claimedAt: notifications.claimedAt,
      attempts: notifications.attempts,
      sentAt: notifications.sentAt,
      failedAt: notifications.failedAt,
      failureCode: notifications.failureCode,
    })
    .from(notifications)
    .where(eq(notifications.eventKey, eventKey));
}

const localHour = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);

beforeEach(async () => {
  await closePendingNotifications(db);
});

describe("enqueue", () => {
  it("writes one row per opted-in channel, delays the paid fallback while a push can be read", async () => {
    const emergency = await fixtures.emergency();
    const withPush = await fixtures.user({ channels: ["push", "sms", "email"], push: 1 });
    const withoutPush = await fixtures.user({ channels: ["push", "whatsapp"] });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    const input = {
      type: "shift_cancelled" as const,
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [withPush.id, withoutPush.id],
    };

    expect(await db.transaction((tx) => enqueueNotification(tx, input))).toBe(4);
    // The same event again inserts nothing: one notice per event, person and channel.
    expect(await enqueueNotification(db, input)).toBe(0);

    const rows = await rowsFor(eventKey);
    const find = (userId: string, channel: string) =>
      rows.find((r) => r.userId === userId && r.channel === channel);
    expect(find(withPush.id, "push")?.notBefore).toEqual(NOW);
    expect(find(withPush.id, "sms")?.notBefore).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    // Important notices skip email (ADR 0007); with no push to wait for, WhatsApp goes at once.
    expect(find(withPush.id, "email")).toBeUndefined();
    expect(find(withoutPush.id, "whatsapp")?.notBefore).toEqual(NOW);
  });

  it("writes one paid channel per event: WhatsApp when chosen, SMS left as its fallback", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push", "sms", "whatsapp"], push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    expect((await rowsFor(eventKey)).map((r) => r.channel).sort()).toEqual(["push", "whatsapp"]);
  });

  it("reaches neighbors only with important notices and only with consent", async () => {
    const emergency = await fixtures.emergency();
    const consenting = await fixtures.neighbor(emergency.id, "whatsapp");
    const silent = await fixtures.neighbor(emergency.id, null);
    const eventKey = `work_item_claimed:${randomUUID()}`;

    const inserted = await enqueueNotification(db, {
      type: "work_item_claimed",
      emergencyId: emergency.id,
      eventKey,
      params: { worksiteId: consenting },
      now: NOW,
      worksiteIds: [consenting, silent],
    });

    expect(inserted).toBe(1);
    expect(await rowsFor(eventKey)).toMatchObject([{ worksiteId: consenting, channel: "whatsapp" }]);
  });

  it("rejects params outside the catalog before writing", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user();
    await expect(
      enqueueNotification(db, {
        type: "shift_cancelled",
        emergencyId: emergency.id,
        eventKey: "bad",
        params: { shiftId: "not-a-uuid", startsAt: "yesterday" },
        now: NOW,
        userIds: [user.id],
      }),
    ).rejects.toThrow();
  });

  it("issues one query for 1 recipient and for 20", async () => {
    const emergency = await fixtures.emergency();
    const enqueueFor = async (n: number) => {
      const recipients = await Promise.all(Array.from({ length: n }, () => fixtures.user({ push: 1 })));
      counter.reset();
      await enqueueNotification(db, {
        type: "shift_reminder",
        emergencyId: emergency.id,
        eventKey: `shift_reminder:${randomUUID()}`,
        params: SHIFT,
        now: NOW,
        userIds: recipients.map((r) => r.id),
      });
      return counter.count;
    };
    expect(await enqueueFor(1)).toBe(await enqueueFor(20));
  });
});

describe("dispatch", () => {
  async function enqueuePush(emergencyId: string, userIds: string[]) {
    const eventKey = `shift_created_nearby:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_created_nearby",
      emergencyId,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds,
    });
    return eventKey;
  }

  it("sends each notice once, in the recipient's language, and never again", async () => {
    const emergency = await fixtures.emergency();
    const spanish = await fixtures.user({ push: 1 });
    const english = await fixtures.user({ push: 1, locale: "en-US" });
    const eventKey = await enqueuePush(emergency.id, [spanish.id, english.id]);
    const recorder = fakeAdapters();

    expect(await dispatch(recorder.adapters)).toMatchObject({ claimed: 2, sent: 2 });
    expect(await dispatch(recorder.adapters)).toMatchObject({ claimed: 0, sent: 0 });

    expect(recorder.sent).toHaveLength(2);
    const titles = recorder.sent.map((d) => [d.message.locale, d.message.title]).sort();
    expect(titles).toEqual([
      ["en", "A new shift nearby"],
      ["es", "Hay un turno nuevo cerca"],
    ]);
    const englishNotice = recorder.sent.find((d) => d.message.locale === "en")!;
    expect(englishNotice.message.url).toBe(`${APP_URL}/n/${englishNotice.notificationId}`);
    // The link opens the shift in the recipient's language.
    expect(await findNotificationLink(db, englishNotice.notificationId)).toBe(
      `/en/emergencies/${emergency.slug}/shifts/${SHIFT.shiftId}`,
    );
    expect((await rowsFor(eventKey)).every((r) => r.sentAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("delivers every row exactly once when two workers run at the same time", async () => {
    const emergency = await fixtures.emergency();
    const recipients = await Promise.all(Array.from({ length: 30 }, () => fixtures.user({ push: 1 })));
    const eventKey = await enqueuePush(
      emergency.id,
      recipients.map((r) => r.id),
    );
    // A slow provider keeps each worker's batch in flight while the other claims.
    const recorder = fakeAdapters(() => ({ ok: true }), 30);

    const [first, second] = await Promise.all([
      dispatch(recorder.adapters, NOW, 10),
      dispatch(recorder.adapters, NOW, 10),
    ]);

    expect(first.sent + second.sent).toBe(30);
    expect(first.sent).toBeGreaterThan(0);
    expect(second.sent).toBeGreaterThan(0);
    const ids = recorder.sent.map((d) => d.notificationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(30);
    expect((await rowsFor(eventKey)).every((r) => r.sentAt !== null)).toBe(true);
  });

  it("retakes a row only after its lease expires", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ push: 1 });
    const eventKey = await enqueuePush(emergency.id, [user.id]);
    const recorder = fakeAdapters();
    const claimedAt = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000);

    await db
      .update(notifications)
      .set({ claimedAt: claimedAt(LEASE_SECONDS - 10) })
      .where(eq(notifications.eventKey, eventKey));
    expect((await dispatch(recorder.adapters)).claimed).toBe(0);

    await db
      .update(notifications)
      .set({ claimedAt: claimedAt(LEASE_SECONDS + 10) })
      .where(eq(notifications.eventKey, eventKey));
    expect((await dispatch(recorder.adapters)).sent).toBe(1);
  });

  it("leaves a row alone when the worker that held it records late, after another retook it", async () => {
    const emergency = await fixtures.emergency({ smsCap: 5 });
    const user = await fixtures.user({ channels: ["sms"] });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });

    // Worker A claims and stalls past its lease; worker B retakes the row and sends it.
    const stalled = await claimNotifications(db, NOW, 10);
    expect(stalled.sendable).toHaveLength(1);
    const later = new Date(NOW.getTime() + (LEASE_SECONDS + 1) * 1000);
    expect((await dispatch(fakeAdapters().adapters, later)).sent).toBe(1);

    // A finally records a retryable failure for the claim it no longer holds.
    const recorded = await recordOutcomes(
      db,
      [
        {
          notification: stalled.sendable[0]!,
          result: { ok: false, code: "provider_unavailable", retryable: true },
          sentAt: later,
        },
      ],
      NOW,
    );

    expect(recorded).toEqual({ sent: [], retried: [], failed: [] });
    expect(await rowsFor(eventKey)).toMatchObject([{ attempts: 2, failedAt: null, claimedAt: null }]);
    expect((await rowsFor(eventKey))[0]?.sentAt).toEqual(later);
    // A's slot is not given back: the cap errs toward spending less (quota.ts).
    const [usage] = await db
      .select({ userCount: notificationDailyUsage.userCount })
      .from(notificationDailyUsage)
      .where(eq(notificationDailyUsage.emergencyId, emergency.id));
    expect(usage?.userCount).toBe(2);
  });

  it("retries a retryable failure with backoff and closes it after the last attempt", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ push: 1 });
    const eventKey = await enqueuePush(emergency.id, [user.id]);
    const recorder = fakeAdapters(() => ({ ok: false, code: "provider_unavailable", retryable: true }));

    expect((await dispatch(recorder.adapters)).retried).toBe(1);
    const [retried] = await rowsFor(eventKey);
    expect(retried).toMatchObject({ attempts: 1, claimedAt: null, sentAt: null, failedAt: null });
    expect(retried?.notBefore).toEqual(new Date(NOW.getTime() + 30_000));

    await db
      .update(notifications)
      .set({ attempts: MAX_ATTEMPTS - 1, notBefore: NOW })
      .where(eq(notifications.eventKey, eventKey));
    expect((await dispatch(recorder.adapters)).failed).toBe(1);
    expect(await rowsFor(eventKey)).toMatchObject([
      { attempts: MAX_ATTEMPTS, failureCode: "provider_unavailable" },
    ]);
  });

  it("closes a permanent failure at once and deletes expired push subscriptions", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ push: 2 });
    const eventKey = await enqueuePush(emergency.id, [user.id]);
    const recorder = fakeAdapters((d) =>
      d.channel === "push"
        ? {
            ok: false,
            code: "no_subscription",
            retryable: false,
            expiredEndpoints: d.subscriptions.map((s) => s.endpoint),
          }
        : { ok: true },
    );

    expect((await dispatch(recorder.adapters)).failed).toBe(1);
    expect(await rowsFor(eventKey)).toMatchObject([{ failureCode: "no_subscription", attempts: 1 }]);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id))).toEqual(
      [],
    );
  });

  it("closes a notice whose channel has no adapter configured", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ push: 1 });
    const eventKey = await enqueuePush(emergency.id, [user.id]);
    const recorder = fakeAdapters();

    await dispatch({ ...recorder.adapters, push: undefined });
    expect(await rowsFor(eventKey)).toMatchObject([{ failureCode: "channel_unavailable" }]);
  });

  it("holds normal notices during quiet hours until 08:00, but not important ones", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push"], push: 1 });
    const normalKey = `shift_created_nearby:${randomUUID()}`;
    const importantKey = `shift_cancelled:${randomUUID()}`;
    const base = { emergencyId: emergency.id, params: SHIFT, now: NIGHT, userIds: [user.id] };
    await enqueueNotification(db, { ...base, type: "shift_created_nearby", eventKey: normalKey });
    await enqueueNotification(db, { ...base, type: "shift_cancelled", eventKey: importantKey });
    const recorder = fakeAdapters();

    expect(await dispatch(recorder.adapters, NIGHT)).toMatchObject({ claimed: 1, sent: 1 });
    expect(recorder.sent.map((d) => d.message.type)).toEqual(["shift_cancelled"]);
    const [held] = await rowsFor(normalKey);
    expect(held).toMatchObject({ sentAt: null, attempts: 0, claimedAt: null });
    expect(localHour(held!.notBefore)).toBe("08");
    expect(held!.notBefore.getTime() - NIGHT.getTime()).toBe(9 * 3600_000);
  });

  it("holds a notice due after midnight until 08:00 the same day", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push"], push: 1 });
    // 03:00 in Santiago.
    const earlyMorning = new Date("2026-10-13T06:00:00Z");
    const eventKey = `shift_created_nearby:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_created_nearby",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: earlyMorning,
      userIds: [user.id],
    });

    expect((await dispatch(fakeAdapters().adapters, earlyMorning)).sent).toBe(0);
    const [held] = await rowsFor(eventKey);
    expect(held!.notBefore.getTime() - earlyMorning.getTime()).toBe(5 * 3600_000);
  });

  it("lets a person who turned quiet hours off receive normal notices at night", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push"], push: 1, quietHours: false });
    await enqueueNotification(db, {
      type: "shift_created_nearby",
      emergencyId: emergency.id,
      eventKey: `shift_created_nearby:${randomUUID()}`,
      params: SHIFT,
      now: NIGHT,
      userIds: [user.id],
    });
    expect((await dispatch(fakeAdapters().adapters, NIGHT)).sent).toBe(1);
  });

  it("issues the same number of queries for a batch of 1 and of 20", async () => {
    const countFor = async (n: number) => {
      await closePendingNotifications(db);
      const emergency = await fixtures.emergency();
      const recipients = await Promise.all(
        Array.from({ length: n }, () => fixtures.user({ channels: ["push", "sms"], push: 1 })),
      );
      await enqueueNotification(db, {
        type: "shift_cancelled",
        emergencyId: emergency.id,
        eventKey: `shift_cancelled:${randomUUID()}`,
        params: SHIFT,
        // SMS fallbacks are already due, so the batch mixes free and paid channels.
        now: new Date(NOW.getTime() - 20 * 60_000),
        userIds: recipients.map((r) => r.id),
      });
      counter.reset();
      await dispatch(fakeAdapters().adapters, NOW, 50);
      return counter.count;
    };
    expect(await countFor(1)).toBe(await countFor(20));
  });
});

describe("escalation", () => {
  it("skips the SMS fallback when the push was read", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push", "sms"], push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    const recorder = fakeAdapters();

    await dispatch(recorder.adapters);
    const push = (await rowsFor(eventKey)).find((r) => r.channel === "push")!;
    await markNotificationRead(db, push.id, new Date(NOW.getTime() + 60_000));

    const later = new Date(NOW.getTime() + 16 * 60_000);
    await dispatch(recorder.adapters, later);
    expect(recorder.sent.map((d) => d.channel)).toEqual(["push"]);
    expect((await rowsFor(eventKey)).find((r) => r.channel === "sms")).toMatchObject({
      failureCode: "read_elsewhere",
    });
  });

  it("does not mark an unsent notice read, and its link hides unknown ids", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push", "sms"], push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    const push = (await rowsFor(eventKey)).find((r) => r.channel === "push")!;

    await markNotificationRead(db, push.id, NOW);
    expect(await findNotificationLink(db, push.id)).toBe(
      `/es/emergencies/${emergency.slug}/shifts/${SHIFT.shiftId}`,
    );
    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, push.id));
    expect(row?.readAt).toBeNull();
    expect(await findNotificationLink(db, randomUUID())).toBeNull();
  });

  it("sends the SMS after 15 minutes when the push was not read", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push", "sms"], push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    const recorder = fakeAdapters();

    await dispatch(recorder.adapters);
    await dispatch(recorder.adapters, new Date(NOW.getTime() + 14 * 60_000));
    expect(recorder.sent.map((d) => d.channel)).toEqual(["push"]);
    await dispatch(recorder.adapters, new Date(NOW.getTime() + 15 * 60_000));
    expect(recorder.sent.map((d) => d.channel)).toEqual(["push", "sms"]);
    expect(recorder.sent[1]).toMatchObject({ channel: "sms", phone: user.phone });
  });

  it("brings the SMS forward when the push fails for good", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["push", "sms"], push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    const recorder = fakeAdapters((d) =>
      d.channel === "push" ? { ok: false, code: "no_subscription", retryable: false } : { ok: true },
    );

    await dispatch(recorder.adapters);
    expect((await rowsFor(eventKey)).find((r) => r.channel === "sms")?.notBefore).toEqual(NOW);
    await dispatch(recorder.adapters, new Date(NOW.getTime() + 1000));
    expect(recorder.sent.map((d) => d.channel)).toEqual(["push", "sms"]);
  });
});

describe("daily cap", () => {
  async function usage(emergencyId: string) {
    const [row] = await db
      .select({
        userCount: notificationDailyUsage.userCount,
        neighborCount: notificationDailyUsage.neighborCount,
      })
      .from(notificationDailyUsage)
      .where(eq(notificationDailyUsage.emergencyId, emergencyId));
    return row;
  }

  it("keeps the reserve for neighbors once volunteers reach the cap", async () => {
    const emergency = await fixtures.emergency({ smsCap: 4, reserve: 2 });
    const volunteers = await Promise.all(
      Array.from({ length: 4 }, () => fixtures.user({ channels: ["sms"] })),
    );
    const neighbors = await Promise.all(
      Array.from({ length: 3 }, () => fixtures.neighbor(emergency.id, "sms")),
    );
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey: `shift_cancelled:${randomUUID()}`,
      params: SHIFT,
      now: NOW,
      userIds: volunteers.map((v) => v.id),
    });
    const recorder = fakeAdapters();

    await dispatch(recorder.adapters);
    // Cap 4 with 2 held for neighbors: volunteers get 2.
    expect(recorder.sent).toHaveLength(2);
    expect(await usage(emergency.id)).toEqual({ userCount: 2, neighborCount: 0 });

    await Promise.all(
      neighbors.map((worksiteId) =>
        enqueueNotification(db, {
          type: "work_item_claimed",
          emergencyId: emergency.id,
          eventKey: `work_item_claimed:${randomUUID()}`,
          params: { worksiteId },
          now: NOW,
          worksiteIds: [worksiteId],
        }),
      ),
    );
    await dispatch(recorder.adapters);
    // The reserve covers two neighbors; the third is left for the coordinator to call.
    expect(recorder.sent).toHaveLength(4);
    expect(await usage(emergency.id)).toEqual({ userCount: 2, neighborCount: 2 });
    const capped = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        sql`${notifications.emergencyId} = ${emergency.id} AND ${notifications.failureCode} = 'daily_cap_reached'`,
      );
    expect(capped).toHaveLength(3);
  });

  it("never grants more than the cap to two workers at once", async () => {
    const emergency = await fixtures.emergency({ smsCap: 5 });
    const volunteers = await Promise.all(
      Array.from({ length: 12 }, () => fixtures.user({ channels: ["sms"] })),
    );
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey: `shift_cancelled:${randomUUID()}`,
      params: SHIFT,
      now: NOW,
      userIds: volunteers.map((v) => v.id),
    });
    // The usage row already exists, so creating it cannot serialize the workers: only the row lock does.
    await db
      .insert(notificationDailyUsage)
      .values({ emergencyId: emergency.id, channel: "sms", day: "2026-10-12" });
    const recorder = fakeAdapters(() => ({ ok: true }), 20);

    const [first, second] = await Promise.all([
      dispatch(recorder.adapters, NOW, 3),
      dispatch(recorder.adapters, NOW, 3),
    ]);

    // Both workers took rows, so the cap held under real contention.
    expect(first.claimed).toBeGreaterThan(0);
    expect(second.claimed).toBeGreaterThan(0);
    expect(recorder.sent).toHaveLength(5);
    expect(await usage(emergency.id)).toEqual({ userCount: 5, neighborCount: 0 });
  });

  it("gives the slot back when a paid message is not sent", async () => {
    const emergency = await fixtures.emergency({ smsCap: 1 });
    const user = await fixtures.user({ channels: ["sms"] });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });

    await dispatch(
      fakeAdapters(() => ({ ok: false, code: "provider_unavailable", retryable: true })).adapters,
    );
    expect(await usage(emergency.id)).toEqual({ userCount: 0, neighborCount: 0 });

    await db
      .update(notifications)
      .set({ notBefore: NOW })
      .where(inArray(notifications.eventKey, [eventKey]));
    expect((await dispatch(fakeAdapters().adapters)).sent).toBe(1);
    expect(await usage(emergency.id)).toEqual({ userCount: 1, neighborCount: 0 });
  });
});
