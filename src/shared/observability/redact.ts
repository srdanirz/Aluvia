/**
 * Strips personal data (phones, emails, RUT, street addresses, IPs) before anything leaves the
 * process: logs, Sentry and PostHog all pass through here. It is a safety net, not a licence:
 * callers still log ids, never contacts (STYLEGUIDE, Datos personales). It over-redacts on
 * purpose; a lost digit in a log is cheaper than a leaked phone.
 */

// The lookbehind starts a match only where a local part can begin; without it a long run of
// letters is rescanned from every position (quadratic: 0.5 s for 5000 characters).
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

// 12.345.678-5, 12345678-5, 12345678K. A bare all-digit RUT is caught by PHONE below.
const RUT = /(?<![\d.])(?:\d{1,2}(?:\.\d{3}){2}-[\dkK]|\d{7,8}(?:-[\dkK]|[kK]))(?![\dkK])/g;

// Any run of 8 to 15 digits (E.164 max) with the separators people type, also glued to a word
// ("contacto-912345678"). UUIDs are set aside before it runs, so their digits are safe.
const PHONE = /(?<!\d)\+?\(?\d(?:[\s().-]*\d){7,14}(?!\d)/g;
// Shapes PHONE also matches that are never a phone.
const NOT_PHONE = /^\d{4}-\d{2}-\d{2}|^\d+\.\d+$/;

const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
const IPV6 =
  /(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?![\w:])/gi;

// "Av. Apoquindo 3000", "calle 5 de abril 1200", "Pasaje 4 #567": a street word, up to five
// words, then the last number they reach (greedy, so a number inside the name is not the end).
const STREET_FIRST =
  /\b(?:av(?:da|enida)?|calle|pasaje|psje|pje|camino|diagonal|paseo|callej[oó]n|villa|poblaci[oó]n|street|avenue|road|lane|drive|boulevard)\.?\s+(?:[\p{L}\p{N}'.]+\s+){0,5}(?:#\s*|n[°º.]?\s*)?\d{1,6}\b/giu;
// "742 Evergreen Terrace", "123 Main St".
const NUMBER_FIRST =
  /\b\d{1,6}\s+(?:[\p{L}'.]+\s+){0,4}?(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|terrace|way|court|ct)\b\.?/giu;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// "q=Calle+Los+Aromos+123" in a query or form body, and "vecina%40example.cl" anywhere. Only
// these spans are decoded: a "+" elsewhere is real (a stack path, "+56").
const QUERY_PAIR = /(?<=^|[?&\s])[\w.-]+=[^&\s#]*/g;
const PERCENT_ENCODED = /(?:%[0-9a-f]{2})+/gi;

/** Replaces personal data inside free text with a typed placeholder. */
export function redactText(text: string): string {
  // Ids are what logs are supposed to carry; only the text between them is scanned.
  const ids = text.match(UUID) ?? [];
  return text
    .split(UUID)
    .map((part, i) => redactPlainText(part) + (ids[i] ?? ""))
    .join("");
}

function redactPlainText(text: string): string {
  const decoded = text
    .replace(QUERY_PAIR, (pair) => pair.replace(/\+/g, " "))
    .replace(PERCENT_ENCODED, decodeText);
  return decoded
    .replace(EMAIL, "[email]")
    .replace(STREET_FIRST, "[address]")
    .replace(NUMBER_FIRST, "[address]")
    .replace(RUT, "[rut]")
    .replace(IPV4, "[ip]")
    .replace(IPV6, (match) => (match === "::" ? match : "[ip]"))
    .replace(PHONE, (match) => (NOT_PHONE.test(match) ? match : "[phone]"));
}

// Keys whose value is personal whatever it looks like. Matched per word, so `contactPhone`,
// `worksite_address` and `X-Forwarded-For` all hit.
const SENSITIVE_WORDS = new Set([
  "phone",
  "telephone",
  "tel",
  "fono",
  "mobile",
  "cell",
  "celular",
  "telefono",
  "whatsapp",
  "email",
  "mail",
  "correo",
  "contact",
  "contacto",
  "address",
  "addr",
  "direccion",
  "domicilio",
  "street",
  "calle",
  "rut",
  "lat",
  "lng",
  "lon",
  "latlng",
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "geom",
  "location",
  "ubicacion",
  "ip",
  "forwarded",
  "note",
  "notes",
  "nota",
  "notas",
  "payload",
  "password",
  "token",
  "secret",
  "otp",
  "cookie",
  "authorization",
  "auth",
  "keys",
  "endpoint",
]);
// "name" or "key" alone is too common (route name, workTypeKey); only these spellings mean a
// person or a credential.
const SENSITIVE_KEYS = new Set([
  "name",
  "fullname",
  "firstname",
  "lastname",
  "givenname",
  "familyname",
  "username",
  "contactname",
  "nombre",
  "nombrecontacto",
  "apellido",
  "apellidos",
  "apikey",
  "logincode",
  "verificationcode",
]);

const FLAG_WORDS = new Set(["is", "has", "can"]);

export function isSensitiveKey(key: string): boolean {
  const words = key
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // `hasLocation`, `isPhoneVerified`, `addressCount` describe the data without holding it.
  if (FLAG_WORDS.has(words[0] ?? "") || words.at(-1) === "count") return false;
  return words.some((word) => SENSITIVE_WORDS.has(word)) || SENSITIVE_KEYS.has(words.join(""));
}

const MAX_DEPTH = 8;

/**
 * Deep copy with sensitive keys replaced by "[redacted]" and every string run through
 * `redactText`. Cycles and anything past MAX_DEPTH become "[truncated]".
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return "[truncated]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen));
  if (value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? "[redacted]" : redactValue(item, depth + 1, seen);
  }
  return out;
}

/** Drops the query string and fragment, which can carry anything a user typed, and redacts the rest. */
export function stripQuery(url: string): string {
  return redactText(url.replace(/[?#].*$/s, ""));
}

const RELATIVE_BASE = "http://relative.invalid";

// A path segment that identifies one record. Every table keys on a UUID (ADR 0005); numbers
// cover anything paginated or external. Slugs are chosen by admins and stay readable.
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

/**
 * Replaces record ids in a URL path with ":id" and drops the query string and fragment, which
 * can carry anything a user typed. Slugs stay: `/es/emergencies/las-condes-2026/worksites/:id`.
 * Accepts absolute URLs and bare paths; anything unparseable is returned redacted as text.
 */
export function redactUrl(url: string): string {
  // Not a URL or a path (PostHog sends "$direct" for no referrer): treat it as free text.
  if (!/^(?:[a-z][a-z\d+.-]*:\/\/|\/)/i.test(url)) return redactText(url);
  let parsed: URL;
  try {
    parsed = new URL(url, RELATIVE_BASE);
  } catch {
    return redactText(url);
  }
  const path = parsed.pathname
    .split("/")
    .map((segment) => (ID_SEGMENT.test(segment) ? ":id" : redactText(decodeText(segment))))
    .join("/");
  return parsed.origin === RELATIVE_BASE ? path : `${parsed.origin}${path}`;
}

function decodeText(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Malformed percent-encoding: keep the raw text, it is still redacted as is.
    return text;
  }
}
