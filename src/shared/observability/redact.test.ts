import { describe, expect, it } from "vitest";

import { isSensitiveKey, redactText, redactUrl, redactValue, stripQuery } from "./redact";

// Every value below is invented. Streets do not exist; phones and RUTs are placeholders.
describe("redactText", () => {
  it.each([
    ["Llamar al +56 9 1234 5678 mañana", "Llamar al [phone] mañana"],
    ["fono 912345678", "fono [phone]"],
    ["fijo (2) 2345 6789", "fijo [phone]"],
    ["tel: +1 555-010-0199", "tel: [phone]"],
    ["escribir a vecina.prueba@example.cl", "escribir a [email]"],
    ["RUT 11.111.111-1 inscrito", "RUT [rut] inscrito"],
    ["rut 22222222-k", "rut [rut]"],
    ["rut 7654321K", "rut [rut]"],
    ["vive en Avenida Los Pájaros Azules 1234, depto 5", "vive en [address], depto 5"],
    ["Av. Ficticia 99", "[address]"],
    ["pasaje Inventado #45", "[address]"],
    ["calle Uno N° 300", "[address]"],
    ["742 Imaginary Terrace", "[address]"],
    ["Pasaje 4 #567", "[address]"],
    ["calle 5 de abril 1200, al fondo", "[address], al fondo"],
    ["contacto-912345678", "contacto-[phone]"],
    ["juan.912345678", "juan.[phone]"],
    ["desde 190.20.3.4", "desde [ip]"],
    ["desde 2001:db8::8a2e:370:7334", "desde [ip]"],
    ["q=Calle+Inventada+123&x=1", "q=[address]&x=1"],
    ["a vecina%40example.cl", "a [email]"],
  ])("redacts %j", (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each([
    "worksite 3f2b8c1e-5d4a-4b6f-9e1a-123456789012 not found",
    "request took 1234 ms",
    "deadline 2026-10-10T12:00:00Z",
    "version 16.4.0 on node 22.11.0",
    "ratio 3.14159265358",
    "sha a1b2c3d4e5f6a7b8c9d0",
    "shift_full",
    "worksite 3f2b8c1e-5d4a-4b6f-9e1a-123456789012 and 4f2b8c1e-5d4a-4b6f-9e1a-000000000000",
    "at 12:00:00 on node:internal",
  ])("keeps %j", (input) => {
    expect(redactText(input)).toBe(input);
  });
});

describe("isSensitiveKey", () => {
  it.each([
    "phone",
    "contactPhone",
    "contact_phone",
    "worksite_address",
    "email",
    "rut",
    "lat",
    "location",
    "X-Forwarded-For",
    "ip_address",
    "name",
    "fullName",
    "first_name",
    "cookie",
    "authorization",
    "notes",
    "official_contact",
    "payload",
    "keys",
    "fono",
    "domicilio",
    "dirección",
    "ubicacion",
    "latlng",
    "remoteAddr",
    "apiKey",
    "loginCode",
    "otp",
    "givenName",
    "family_name",
    "nombreContacto",
    "apellidos",
  ])("flags %s", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    "routeName",
    "eventName",
    "workType",
    "status",
    "worksiteId",
    "relationship",
    "trip",
    "hasLocation",
    "isPhoneVerified",
    "addressCount",
    "workTypeKey",
    "code",
  ])("keeps %s", (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe("redactValue", () => {
  it("redacts sensitive keys and strings at any depth, without touching the input", () => {
    const input = {
      worksiteId: "3f2b8c1e-5d4a-4b6f-9e1a-123456789012",
      count: 3,
      contact: { phone: "+56 9 1234 5678", note: "avisar a correo@example.cl" },
      items: [{ address: "calle Uno 1" }, "fono 912345678"],
    };
    const copy = structuredClone(input);

    expect(redactValue(input)).toEqual({
      worksiteId: "3f2b8c1e-5d4a-4b6f-9e1a-123456789012",
      count: 3,
      contact: "[redacted]",
      items: [{ address: "[redacted]" }, "fono [phone]"],
    });
    expect(input).toEqual(copy);
  });

  it("survives cycles and deep nesting", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(redactValue(cyclic)).toEqual({ a: 1, self: "[truncated]" });

    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(JSON.stringify(redactValue(deep))).toContain("[truncated]");
  });
});

describe("redactUrl", () => {
  it.each([
    [
      "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/3f2b8c1e-5d4a-4b6f-9e1a-123456789012?phone=912345678#notes",
      "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/:id",
    ],
    ["/es/emergencies/aluvion-2026/shifts/42", "/es/emergencies/aluvion-2026/shifts/:id"],
    ["/es/search/%2B56912345678", "/es/search/[phone]"],
    ["/es/dev/ui", "/es/dev/ui"],
    ["$direct", "$direct"],
    ["not a url with vecina@example.cl", "not a url with [email]"],
  ])("redacts %s", (input, expected) => {
    expect(redactUrl(input)).toBe(expected);
  });
});

describe("stripQuery", () => {
  it("keeps ids, drops the query and fragment", () => {
    expect(stripQuery("https://aluvia.cl/es/worksites/42?q=Vecina Inventada#x")).toBe(
      "https://aluvia.cl/es/worksites/42",
    );
  });
});

describe("redactText performance", () => {
  // Every log line, error and event goes through it: a quadratic regex here stalls the server.
  it.each(["a", "1", "deadbeef", "1.", "12-", "a@", ":a", "%41", "x=a+"])(
    "stays linear on a long run of %j",
    (unit) => {
      const text = unit.repeat(Math.ceil(20_000 / unit.length));
      const start = performance.now();
      redactText(text);
      // Linear takes ~1 ms; the quadratic email regex this guards against took ~8 s. The wide
      // bound keeps the test honest on a loaded CI runner.
      expect(performance.now() - start).toBeLessThan(2_000);
    },
  );
});
