import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cancelPendingNotifications, enqueueNotification } from "@/features/notifications";
import { dispatchNotifications } from "@/features/notifications/server/dispatch";
import { claimNotifications } from "@/features/notifications/server/claim";
import { markNotificationUndelivered } from "@/features/notifications/server/delivery-status";
import { recordOutcomes } from "@/features/notifications/server/outcomes";
import { optOutFromSms } from "@/features/notifications/server/opt-out";
import { listUndeliveredNeighborNotices } from "@/features/notifications/server/queries";
import { notificationPreferences, notifications, worksiteContacts } from "@/shared/db/schema";

import { createTestDb } from "../setup/db";
import { APP_URL, closePendingNotifications, createFixtures, fakeAdapters } from "./fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);
const fixtures = createFixtures(db);

const NOW = new Date("2026-10-12T18:00:00Z");
const SHIFT = { shiftId: "00000000-0000-4000-8000-000000000001", startsAt: "2026-10-13T12:00:00Z" };

const dispatch = (adapters: ReturnType<typeof fakeAdapters>["adapters"]) =>
  dispatchNotifications({
    db,
    adapters,
    appUrl: APP_URL,
    clock: () => NOW,
    deadline: new Date(NOW.getTime() + 60_000),
  });

const rowsFor = (eventKey: string) =>
  db
    .select({
      channel: notifications.channel,
      sentAt: notifications.sentAt,
      failureCode: notifications.failureCode,
    })
    .from(notifications)
    .where(eq(notifications.eventKey, eventKey));

async function notifyNeighbor(emergencyId: string, worksiteId: string) {
  const eventKey = `work_item_claimed:${randomUUID()}`;
  await enqueueNotification(db, {
    type: "work_item_claimed",
    emergencyId,
    eventKey,
    params: { worksiteId },
    now: NOW,
    worksiteIds: [worksiteId],
  });
  return eventKey;
}

beforeEach(async () => {
  await closePendingNotifications(db);
});

describe("WhatsApp falls back to SMS", () => {
  it("when Meta rejects the message for good", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const recorder = fakeAdapters((d) =>
      d.channel === "whatsapp" ? { ok: false, code: "template_missing", retryable: false } : { ok: true },
    );

    await dispatch(recorder.adapters);
    await dispatch(recorder.adapters);

    expect(recorder.sent.map((d) => d.channel)).toEqual(["whatsapp", "sms"]);
    expect(
      (await rowsFor(eventKey)).map((r) => [r.channel, r.failureCode, r.sentAt !== null]).sort(),
    ).toEqual([
      ["sms", null, true],
      ["whatsapp", "template_missing", false],
    ]);
  });

  it("when WhatsApp is not configured", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const recorder = fakeAdapters();

    await dispatch({ ...recorder.adapters, whatsapp: undefined });
    await dispatch({ ...recorder.adapters, whatsapp: undefined });

    expect(recorder.sent.map((d) => d.channel)).toEqual(["sms"]);
    expect((await rowsFor(eventKey)).find((r) => r.channel === "whatsapp")?.failureCode).toBe(
      "channel_unavailable",
    );
  });

  it("when the WhatsApp cap is spent but SMS has room", async () => {
    const emergency = await fixtures.emergency({ whatsappCap: 0, smsCap: 5 });
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    await notifyNeighbor(emergency.id, worksiteId);
    const recorder = fakeAdapters();

    await dispatch(recorder.adapters);
    await dispatch(recorder.adapters);

    expect(recorder.sent.map((d) => d.channel)).toEqual(["sms"]);
  });

  it("when Meta reports the message undelivered after accepting it", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const recorder = fakeAdapters((d) => ({ ok: true, providerMessageId: `wamid.${d.notificationId}` }));

    await dispatch(recorder.adapters);
    const whatsapp = recorder.sent[0]!;
    await markNotificationUndelivered(db, {
      channel: "whatsapp",
      providerMessageId: `wamid.${whatsapp.notificationId}`,
      code: "whatsapp_undelivered",
      now: NOW,
    });
    await dispatch(recorder.adapters);

    expect(recorder.sent.map((d) => d.channel)).toEqual(["whatsapp", "sms"]);
    expect((await rowsFor(eventKey)).find((r) => r.channel === "whatsapp")).toMatchObject({
      sentAt: null,
      failureCode: "whatsapp_undelivered",
    });
  });

  it("when the failure is reported before the worker recorded the message id", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const providerMessageId = `wamid.${randomUUID()}`;
    // The report lands while the worker is still waiting on the rest of its batch.
    const claimed = await claimNotifications(db, NOW, 10);
    await markNotificationUndelivered(db, {
      channel: "whatsapp",
      providerMessageId,
      code: "whatsapp_undelivered",
      now: NOW,
    });
    await recordOutcomes(
      db,
      [{ notification: claimed.sendable[0]!, result: { ok: true, providerMessageId }, sentAt: NOW }],
      NOW,
    );

    const recorder = fakeAdapters();
    await dispatch(recorder.adapters);
    expect(recorder.sent.map((d) => d.channel)).toEqual(["sms"]);
    expect((await rowsFor(eventKey)).find((r) => r.channel === "whatsapp")?.failureCode).toBe(
      "whatsapp_undelivered",
    );
  });

  it("only for volunteers who opted into SMS", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ channels: ["whatsapp"] });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [user.id],
    });
    const recorder = fakeAdapters(() => ({ ok: false, code: "provider_rejected", retryable: false }));

    await dispatch(recorder.adapters);
    await dispatch(recorder.adapters);

    expect(recorder.sent.map((d) => d.channel)).toEqual(["whatsapp"]);
    expect((await rowsFor(eventKey)).map((r) => r.channel)).toEqual(["whatsapp"]);
  });
});

describe("BAJA", () => {
  it("is also honored when Twilio reports the number opted out", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "sms");
    await notifyNeighbor(emergency.id, worksiteId);
    await dispatch(
      fakeAdapters(() => ({ ok: false, code: "recipient_opted_out", retryable: false })).adapters,
    );

    const [contact] = await db
      .select({ notifyChannel: worksiteContacts.notifyChannel })
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, worksiteId));
    expect(contact?.notifyChannel).toBeNull();
  });

  it("ends the neighbor's consent and the volunteer's SMS, and pending SMS close unsent", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "sms");
    const [contact] = await db
      .select({ phone: worksiteContacts.phone })
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, worksiteId));
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const user = await fixtures.user({ channels: ["push", "sms"] });

    await optOutFromSms(db, [contact!.phone!]);
    await optOutFromSms(db, [user.phone]);
    const recorder = fakeAdapters();
    await dispatch(recorder.adapters);

    expect(recorder.sent).toEqual([]);
    expect(await rowsFor(eventKey)).toMatchObject([{ failureCode: "no_consent" }]);
    const [preferences] = await db
      .select({ channels: notificationPreferences.channels })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id));
    expect(preferences?.channels).toEqual(["push"]);
  });
});

describe("neighbors to call", () => {
  it("lists neighbors no channel reached, without those an SMS fallback reached or who opted out", async () => {
    const emergency = await fixtures.emergency({ smsCap: 0, whatsappCap: 0 });
    const unreached = await fixtures.neighbor(emergency.id, "whatsapp");
    const optedOut = await fixtures.neighbor(emergency.id, "sms");
    await notifyNeighbor(emergency.id, unreached);
    await notifyNeighbor(emergency.id, optedOut);
    const [contact] = await db
      .select({ phone: worksiteContacts.phone })
      .from(worksiteContacts)
      .where(eq(worksiteContacts.worksiteId, optedOut));
    await optOutFromSms(db, [contact!.phone!]);

    // WhatsApp and its SMS fallback both hit the cap; the opted-out neighbor closes as no_consent.
    await dispatch(fakeAdapters().adapters);
    await dispatch(fakeAdapters().adapters);

    // A notice withdrawn on purpose is not a home to call.
    const cancelled = await fixtures.neighbor(emergency.id, "sms");
    const cancelledKey = await notifyNeighbor(emergency.id, cancelled);
    await cancelPendingNotifications(db, { eventKey: cancelledKey, now: NOW });

    const page = await listUndeliveredNeighborNotices(db, { emergencyId: emergency.id });
    expect(page.items.map((i) => i.worksiteId)).toEqual([unreached]);
    expect(page.nextCursor).toBeNull();
  });

  it("pages by cursor in one query per page, whatever the page size", async () => {
    const emergency = await fixtures.emergency({ smsCap: 0, whatsappCap: 0 });
    const homes = await Promise.all(Array.from({ length: 21 }, () => fixtures.neighbor(emergency.id, "sms")));
    await Promise.all(homes.map((home) => notifyNeighbor(emergency.id, home)));
    await dispatch(fakeAdapters().adapters);

    counter.reset();
    const first = await listUndeliveredNeighborNotices(db, { emergencyId: emergency.id, pageSize: 1 });
    const one = counter.count;
    counter.reset();
    const second = await listUndeliveredNeighborNotices(db, {
      emergencyId: emergency.id,
      pageSize: 20,
      cursor: first.nextCursor!,
    });
    expect(counter.count).toBe(one);
    expect(second.items).toHaveLength(20);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((i) => i.worksiteId)).size).toBe(21);
  });
});

describe("cancelling", () => {
  it("closes unclaimed notices and keeps a held one from retrying or falling back", async () => {
    const emergency = await fixtures.emergency();
    const [held, pending] = await Promise.all([fixtures.user({ push: 1 }), fixtures.user({ push: 1 })]);
    const eventKey = `shift_reminder:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_reminder",
      emergencyId: emergency.id,
      eventKey,
      params: SHIFT,
      now: NOW,
      userIds: [held.id, pending.id],
    });
    // A worker holds one row while the sign-up is cancelled; then its send fails retryably.
    const claimed = await claimNotifications(db, NOW, 1);
    const heldRow = claimed.sendable[0]!;
    expect(await cancelPendingNotifications(db, { eventKey, now: NOW })).toBe(1);
    await recordOutcomes(
      db,
      [
        {
          notification: heldRow,
          result: { ok: false, code: "provider_unavailable", retryable: true },
          sentAt: NOW,
        },
      ],
      NOW,
    );

    const recorder = fakeAdapters();
    await dispatch(recorder.adapters);
    expect(recorder.sent).toEqual([]);
    expect((await rowsFor(eventKey)).map((r) => r.failureCode)).toEqual(["cancelled", "cancelled"]);
  });

  it("keeps a cancelled event from coming back through a late undelivered report", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "whatsapp");
    const eventKey = await notifyNeighbor(emergency.id, worksiteId);
    const providerMessageId = `wamid.${randomUUID()}`;
    await dispatch(fakeAdapters(() => ({ ok: true, providerMessageId })).adapters);

    await cancelPendingNotifications(db, { eventKey, now: NOW });
    await markNotificationUndelivered(db, {
      channel: "whatsapp",
      providerMessageId,
      code: "whatsapp_undelivered",
      now: NOW,
    });
    const recorder = fakeAdapters();
    await dispatch(recorder.adapters);

    expect(recorder.sent).toEqual([]);
    expect((await rowsFor(eventKey)).map((r) => r.channel)).toEqual(["whatsapp"]);
    const page = await listUndeliveredNeighborNotices(db, { emergencyId: emergency.id });
    expect(page.items).toEqual([]);
  });
});
