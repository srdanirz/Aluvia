import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Turns what a person typed ("9 1234 5678") into E.164, reading the country from the browser's
 * language region ("es-CL" → CL) so no country is written in code. Without a region the person
 * types the country code. Null when it is not a valid phone.
 */
export function toE164(input: string, languages: readonly string[]): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Only an explicit region counts: maximizing a bare "es" would guess Spain for everyone.
  const region = languages
    .map((tag) => new Intl.Locale(tag).region)
    .find((value): value is string => value !== undefined && /^[A-Z]{2}$/.test(value));
  const phone = parsePhoneNumberFromString(trimmed, region as CountryCode | undefined);
  return phone?.isValid() ? phone.number : null;
}
