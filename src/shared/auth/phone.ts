import "server-only";

import { type CountryCode, isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";

import { env } from "@/shared/env";

const regions = env.PHONE_REGIONS.filter((region): region is CountryCode => isSupportedCountry(region));

/**
 * The E.164 form of a number as someone typed it ("9 8765 4321", "+56 9 8765 4321"), or null
 * when it is not a valid number of an allowed country. Landlines are not filtered out: with
 * number portability Chile's metadata marks most ranges as "fixed line or mobile", so a
 * landline is caught by the code never arriving, and the per-phone limit caps what it costs.
 */
export function normalizePhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, regions[0]);
  if (!phone?.isValid() || !phone.country || !regions.includes(phone.country)) return null;
  return phone.number;
}
