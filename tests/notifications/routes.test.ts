import { createHmac, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { enqueueNotification } from "@/features/notifications";
import { notifications, worksiteContacts } from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";

import { createTestDb } from "../setup/db";
import { APP_URL, closePendingNotifications, createFixtures } from "./fixtures";

// The routes import the app's db handle; here it is the test database.
const handle = vi.hoisted(() => ({ db: undefined as unknown as Database }));
vi.mock("@/shared/db/client", () => ({
  get db() {
    return handle.db;
  },
}));

const { db, close } = createTestDb();
handle.db = db;
afterAll(close);
const fixtures = createFixtures(db);

const NOW = new Date("2026-10-12T18:00:00Z");
const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = `${APP_URL}/api/v1/webhooks/twilio`;

type Routes = {
  twilio: (request: Request) => Promise<Response>;
  read: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};
let routes: Routes;

beforeAll(async () => {
  // Provider config is read at import, so the env goes in before the routes load.
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"0".repeat(32)}`);
  vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
  vi.stubEnv("TWILIO_FROM", "+56999900000");
  const twilio = await import("@/app/api/v1/webhooks/twilio/route");
  const read = await import("@/app/api/v1/notifications/[id]/read/route");
  routes = { twilio: twilio.POST, read: read.POST as Routes["read"] };
  await closePendingNotifications(db);
});

/** A request signed the way Twilio signs: HMAC-SHA1 of the URL plus sorted params. */
function twilioRequest(params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], WEBHOOK_URL);
  const signature = createHmac("sha1", AUTH_TOKEN).update(data).digest("base64");
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "x-twilio-signature": signature, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

async function consentOf(worksiteId: string) {
  const [contact] = await db
    .select({ phone: worksiteContacts.phone, notifyChannel: worksiteContacts.notifyChannel })
    .from(worksiteContacts)
    .where(eq(worksiteContacts.worksiteId, worksiteId));
  return contact!;
}

describe("Twilio webhook", () => {
  it("rejects a request Twilio did not sign", async () => {
    const forged = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "x-twilio-signature": "forged" },
      body: new URLSearchParams({ From: "+56999900001", Body: "BAJA" }),
    });
    expect((await routes.twilio(forged)).status).toBe(403);
  });

  it("turns SMS off when a neighbor answers BAJA", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "sms");
    const { phone } = await consentOf(worksiteId);

    const response = await routes.twilio(twilioRequest({ From: phone!, Body: "Baja." }));

    expect(response.status).toBe(200);
    expect((await consentOf(worksiteId)).notifyChannel).toBeNull();
  });

  it("turns SMS off when a status callback reports 21610", async () => {
    const emergency = await fixtures.emergency();
    const worksiteId = await fixtures.neighbor(emergency.id, "sms");
    const { phone } = await consentOf(worksiteId);

    const response = await routes.twilio(
      twilioRequest({ MessageSid: "SM1", MessageStatus: "failed", ErrorCode: "21610", To: phone! }),
    );

    expect(response.status).toBe(204);
    expect((await consentOf(worksiteId)).notifyChannel).toBeNull();
  });
});

describe("read route", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (id: string) =>
    routes.read(new Request(`${APP_URL}/api/v1/notifications/${id}/read`), ctx(id));

  it("marks a sent notice read, ignores an unsent one, and rejects a malformed id as a bad request", async () => {
    const emergency = await fixtures.emergency();
    const user = await fixtures.user({ push: 1 });
    const eventKey = `shift_cancelled:${randomUUID()}`;
    await enqueueNotification(db, {
      type: "shift_cancelled",
      emergencyId: emergency.id,
      eventKey,
      params: { shiftId: "00000000-0000-4000-8000-000000000001", startsAt: "2026-10-13T12:00:00Z" },
      now: NOW,
      userIds: [user.id],
    });
    const [row] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.eventKey, eventKey));
    const readAt = async () =>
      (
        await db
          .select({ readAt: notifications.readAt })
          .from(notifications)
          .where(eq(notifications.id, row!.id))
      )[0]?.readAt;

    expect((await post(row!.id)).status).toBe(204);
    expect(await readAt()).toBeNull();

    await db.update(notifications).set({ sentAt: NOW }).where(eq(notifications.id, row!.id));
    expect((await post(row!.id)).status).toBe(204);
    expect(await readAt()).not.toBeNull();

    expect((await post("not-a-uuid")).status).toBe(400);
    expect((await post(randomUUID())).status).toBe(204);
  });
});
