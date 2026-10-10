import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NOTIFICATION_TYPES, type NotificationType } from "@/features/notifications";
import { createPushAdapter } from "@/features/notifications/channels/push";
import { isOptOutReply } from "@/features/notifications/server/opt-out";
import { retryDelaySeconds } from "@/features/notifications/server/outcomes";
import { allocatePaidMessages } from "@/features/notifications/server/quota";
import { renderMessage } from "@/features/notifications/server/render";
import { LOCALES } from "@/shared/i18n/locales";
import { SMS_SEGMENT_LENGTH, gsm7Length, toGsm7 } from "@/shared/messaging/gsm";
import { sendSms, verifyTwilioSignature } from "@/shared/messaging/twilio";
import { sendWhatsAppTemplate } from "@/shared/messaging/whatsapp";

const TWILIO = {
  TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "12345",
  TWILIO_FROM: "+56900000000",
};
const WHATSAPP = { WHATSAPP_ACCESS_TOKEN: "token", WHATSAPP_PHONE_NUMBER_ID: "1234567890" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown = {}) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("GSM-7", () => {
  it("drops accents GSM-7 lacks and keeps the ones it has", () => {
    expect(toGsm7("Tomaron un trabajo en tu casa: ¿llegó? Ñuñoa, él")).toBe(
      "Tomaron un trabajo en tu casa: ¿llego? Ñuñoa, él",
    );
  });

  it("counts extended characters as two septets", () => {
    expect(gsm7Length("a€[")).toBe(5);
  });
});

describe("Twilio", () => {
  // Vector computed with twilio@6.1.2's own validateRequest.
  const signed = {
    url: "https://example.org/api/v1/webhooks/twilio",
    params: [
      ["To", "+18005551212"],
      ["CallSid", "CA1234567890ABCDE"],
      ["Caller", "+12349013030"],
      ["Digits", "1234"],
      ["From", "+12349013030"],
    ] as [string, string][],
    signature: "0DigUL8nP0ICIJ6cObkjBxLnPfk=",
  };

  it("accepts Twilio's signature and rejects a tampered request", () => {
    expect(verifyTwilioSignature(signed, TWILIO)).toBe(true);
    expect(
      verifyTwilioSignature(
        {
          ...signed,
          params: signed.params.map(([k, v]) => [k, k === "Digits" ? "9999" : v] as [string, string]),
        },
        TWILIO,
      ),
    ).toBe(false);
    expect(verifyTwilioSignature({ ...signed, signature: "" }, TWILIO)).toBe(false);
  });

  it("sends a GSM-7 body as a form and maps permanent errors", async () => {
    const fetch = stubFetch(201);
    expect(await sendSms({ to: "+56911111111", body: "Aluvia: se canceló tu turno." }, TWILIO)).toEqual({
      ok: true,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO.TWILIO_ACCOUNT_SID}/Messages.json`);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      To: "+56911111111",
      From: TWILIO.TWILIO_FROM,
      Body: "Aluvia: se cancelo tu turno.",
    });

    stubFetch(400, { code: 21610 });
    expect(await sendSms({ to: "+56911111111", body: "x" }, TWILIO)).toEqual({
      ok: false,
      code: "recipient_opted_out",
      retryable: false,
    });
    stubFetch(503);
    expect(await sendSms({ to: "+56911111111", body: "x" }, TWILIO)).toMatchObject({
      ok: false,
      retryable: true,
    });
  });

  it("refuses a body longer than one segment instead of splitting it", async () => {
    const fetch = stubFetch(201);
    expect(await sendSms({ to: "+56911111111", body: "a".repeat(SMS_SEGMENT_LENGTH + 1) }, TWILIO)).toEqual({
      ok: false,
      code: "message_too_long",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is off without configuration", async () => {
    expect(await sendSms({ to: "+56911111111", body: "x" }, null)).toEqual({
      ok: false,
      code: "channel_unavailable",
      retryable: false,
    });
  });
});

describe("WhatsApp", () => {
  it("sends an approved template with the link and, for login codes, a copy-code button", async () => {
    const fetch = stubFetch(200);
    await sendWhatsAppTemplate(
      {
        to: "+56911111111",
        template: "login_code",
        language: "es",
        bodyParams: ["123456"],
        copyCodeButton: "123456",
      },
      WHATSAPP,
    );
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v26.0/1234567890/messages");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "56911111111",
      type: "template",
      template: {
        name: "login_code",
        language: { code: "es" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "123456" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
        ],
      },
    });
  });

  it("maps a missing template to a permanent failure and throttling to a retry", async () => {
    stubFetch(404, { error: { code: 132001 } });
    expect(
      await sendWhatsAppTemplate(
        { to: "+56911111111", template: "x", language: "es", bodyParams: [] },
        WHATSAPP,
      ),
    ).toEqual({
      ok: false,
      code: "template_missing",
      retryable: false,
    });
    stubFetch(429, { error: { code: 130429 } });
    expect(
      await sendWhatsAppTemplate(
        { to: "+56911111111", template: "x", language: "es", bodyParams: [] },
        WHATSAPP,
      ),
    ).toMatchObject({
      retryable: true,
    });
  });
});

describe("push adapter", () => {
  it("is absent without VAPID keys", () => {
    expect(createPushAdapter(null)).toBeNull();
  });
});

describe("daily cap allocation", () => {
  const usage = (userCount: number, neighborCount: number, cap: number, reserve: number) =>
    new Map([["k", { userCount, neighborCount, cap, reserve }]]);
  const requests = (users: number, neighbors: number) => [
    ...Array.from({ length: users }, (_, i) => ({ id: `u${i}`, key: "k", isNeighbor: false })),
    ...Array.from({ length: neighbors }, (_, i) => ({ id: `n${i}`, key: "k", isNeighbor: true })),
  ];

  it("stops volunteers where the neighbor reserve begins", () => {
    const { denied, usage: next } = allocatePaidMessages(usage(0, 0, 10, 3), requests(10, 0));
    expect(denied).toHaveLength(3);
    expect(next.get("k")).toMatchObject({ userCount: 7, neighborCount: 0 });
  });

  it("lets neighbors use the whole cap and frees the reserve as they use it", () => {
    const { denied, usage: next } = allocatePaidMessages(usage(7, 0, 10, 3), requests(2, 2));
    // Two neighbors take two of the reserve; volunteers still cannot touch the last one.
    expect(denied.sort()).toEqual(["u0", "u1"]);
    expect(next.get("k")).toMatchObject({ userCount: 7, neighborCount: 2 });
  });

  it("denies everything with a cap of zero, the default of a new emergency", () => {
    expect(allocatePaidMessages(usage(0, 0, 0, 0), requests(1, 1)).denied).toHaveLength(2);
  });
});

describe("retries", () => {
  it("backs off exponentially up to 30 minutes", () => {
    expect([1, 2, 3, 7, 8].map(retryDelaySeconds)).toEqual([30, 60, 120, 1800, 1800]);
  });
});

describe("opt-out replies", () => {
  it("understands BAJA in any case and with stray spaces", () => {
    expect(["BAJA", " baja ", "Stop", "salir", "Baja.", "BAJA!", "¡Baja!"].every(isOptOutReply)).toBe(true);
    expect(isOptOutReply("baja la tapa")).toBe(false);
  });
});

describe("WhatsApp templates", () => {
  // Every notice that can go by WhatsApp needs a template approved by Meta before it is needed.
  it("are listed in ADR 0010 for every important type", () => {
    const adr = readFileSync("docs/adr/0010-proveedores-de-avisos.md", "utf8");
    const important = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
      (type) => NOTIFICATION_TYPES[type].level === "important",
    );
    expect(important.filter((type) => !adr.includes(`| \`${type}\` |`))).toEqual([]);
  });
});

describe("copy", () => {
  // A long production domain; the short link adds /n/ and a uuid.
  const LONG_APP_URL = "https://aluvia-coordinacion.example.org";
  const ID = "00000000-0000-4000-8000-000000000009";
  const SAMPLE = {
    shiftId: "00000000-0000-4000-8000-000000000001",
    worksiteId: "00000000-0000-4000-8000-000000000002",
    startsAt: "2026-10-13T12:00:00Z",
    count: "3",
  };
  const cases = LOCALES.flatMap((locale) =>
    (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => [locale, type] as const),
  );

  it.each(cases)("%s %s renders and its SMS fits one GSM-7 segment", async (locale, type) => {
    const message = await renderMessage({
      notificationId: ID,
      type,
      payload: SAMPLE,
      locale,
      emergency: { timeZone: "America/Santiago" },
      appUrl: LONG_APP_URL,
    });
    expect(message).not.toBeNull();
    expect(message!.title.length).toBeGreaterThan(0);
    // next-intl renders the key itself when a message is missing; that must never be sent.
    expect(message!.title).not.toBe(`${type}.title`);
    expect(message!.body).not.toMatch(/[{}]/);
    expect(message!.url).toBe(`${LONG_APP_URL}/n/${ID}`);
    expect(message!.sms).toContain(message!.url);
    expect(gsm7Length(toGsm7(message!.sms))).toBeLessThanOrEqual(SMS_SEGMENT_LENGTH);
  });

  it("writes shift times in the emergency's time zone", async () => {
    const message = await renderMessage({
      notificationId: ID,
      type: "shift_reminder",
      payload: { shiftId: SAMPLE.shiftId, startsAt: SAMPLE.startsAt },
      locale: "es",
      emergency: { timeZone: "America/Santiago" },
      appUrl: "https://a.example.org",
    });
    // 12:00 UTC is 09:00 in Santiago in October.
    expect(message?.body).toContain("09:00");
  });

  it("returns null for a type or params the catalog no longer has", async () => {
    const base = {
      notificationId: ID,
      locale: "es" as const,
      emergency: { timeZone: "America/Santiago" },
      appUrl: "https://a.example.org",
    };
    expect(await renderMessage({ ...base, type: "gone", payload: {} })).toBeNull();
    expect(await renderMessage({ ...base, type: "shift_reminder", payload: {} })).toBeNull();
  });
});
