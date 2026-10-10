/**
 * GSM-7, the SMS alphabet that fits 160 characters in one segment. Twilio's Chilean long codes
 * reject concatenated messages (ADR 0010), and one accented letter outside this set switches the
 * whole SMS to UCS-2, which fits only 70. So SMS copy is transliterated before it is sent.
 */
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Each of these takes two septets: an escape plus the character.
const EXTENDED = "^{}\\[~]|€";

export const SMS_SEGMENT_LENGTH = 160;

const REPLACEMENTS: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "…": "...",
  " ": " ",
  "·": "-",
};

/** Keeps what GSM-7 has, strips accents GSM-7 lacks (á becomes a, ñ stays) and drops the rest. */
export function toGsm7(text: string): string {
  return Array.from(text, (char) => {
    if (BASIC.includes(char) || EXTENDED.includes(char)) return char;
    const replacement = REPLACEMENTS[char];
    if (replacement !== undefined) return replacement;
    const stripped = char.normalize("NFD").replace(/\p{M}/gu, "");
    return Array.from(stripped).every((c) => BASIC.includes(c)) ? stripped : "";
  }).join("");
}

/** Septets a GSM-7 text takes; compare it with SMS_SEGMENT_LENGTH. */
export function gsm7Length(text: string): number {
  return Array.from(text).reduce((length, char) => length + (EXTENDED.includes(char) ? 2 : 1), 0);
}
