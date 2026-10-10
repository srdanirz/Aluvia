import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { redactSentryEvent } from "./sentry";

describe("redactSentryEvent", () => {
  it("removes personal data from every field Sentry sends", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "fallo al avisar a vecina@example.cl",
      exception: {
        values: [
          {
            type: "Error",
            value: "telefono invalido +56 9 1234 5678",
            stacktrace: {
              frames: [
                { filename: "app.js", vars: { phone: "+56 9 1234 5678" } },
                {
                  filename: "https://aluvia.cl/_next/static/chunks/0e5f12345678ab9c.js?v=Vecina Inventada",
                  abs_path: "https://aluvia.cl/es/report?q=Vecina Inventada",
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { message: "rut 11.111.111-1 enviado", data: { address: "calle Uno 1", count: 2 } },
        { category: "fetch", data: { url: "/api/v1/x?q=Vecina Inventada" } },
        { category: "navigation", data: { from: "/es?q=Vecina Inventada", to: "/es/worksites/42" } },
        {
          category: "http",
          data: { url: "https://maps.example/geocode", "http.query": "address=Calle+Inventada+123" },
        },
      ],
      request: {
        url: "https://aluvia.cl/es/report?phone=912345678",
        query_string: "phone=912345678",
        cookies: { session: "abc" },
        data: { contactPhone: "+56 9 1234 5678", workTypeCount: 2 },
        headers: { "user-agent": "Mobile Safari", cookie: "session=abc", "x-forwarded-for": "10.0.0.1" },
      },
      contexts: {
        nextjs: { request_path: "/es/buscar?q=Vecina Inventada", route_type: "render" },
        os: { name: "iOS", version: "18.0" },
        custom: { contactName: "Vecina Inventada" },
      },
      user: {
        id: "3f2b8c1e-5d4a-4b6f-9e1a-123456789012",
        email: "vecina@example.cl",
        ip_address: "10.0.0.1",
      },
      extra: { note: "Av. Ficticia 99" },
      tags: { route: "/[locale]/report" },
    };

    const redacted = redactSentryEvent(event);
    const serialized = JSON.stringify(redacted);

    for (const leaked of [
      "vecina@example.cl",
      "1234 5678",
      "912345678",
      "11.111.111-1",
      "Ficticia",
      "calle Uno",
      "10.0.0.1",
      "session",
      "Vecina Inventada",
      "Calle+Inventada",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(redacted.request?.url).toBe("https://aluvia.cl/es/report");
    expect(redacted.breadcrumbs?.[2]?.data).toEqual({ from: "/es", to: "/es/worksites/42" });
    expect(redacted.user).toEqual({ id: "3f2b8c1e-5d4a-4b6f-9e1a-123456789012" });
    expect(redacted.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: "app.js" },
      {
        filename: "https://aluvia.cl/_next/static/chunks/0e5f12345678ab9c.js",
        abs_path: "https://aluvia.cl/es/report",
      },
    ]);
    expect(redacted.request?.data).toBeUndefined();
    expect(redacted.request?.headers).toEqual({ "user-agent": "Mobile Safari" });
    expect(redacted.breadcrumbs?.[3]?.data).toEqual({ url: "https://maps.example/geocode" });
    expect(redacted.contexts).toEqual({
      nextjs: { request_path: "/es/buscar", route_type: "render" },
      os: { name: "iOS", version: "18.0" },
      custom: { contactName: "[redacted]" },
    });
    expect(redacted.tags).toEqual({ route: "/[locale]/report" });
  });

  it("drops a user without an id", () => {
    expect(redactSentryEvent({ type: undefined, user: { email: "vecina@example.cl" } }).user).toBeUndefined();
  });
});
