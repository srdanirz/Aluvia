import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

// Words that mean "stop" in a reply (ADR 0007: BAJA), compared without accents, case or punctuation.
export const OPT_OUT_WORDS = ["BAJA", "STOP", "SALIR", "CANCELAR"];

export function isOptOutReply(body: string): boolean {
  const word = body
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .toUpperCase();
  return OPT_OUT_WORDS.includes(word);
}

/**
 * Turns SMS off for these phones everywhere: the neighbor consents behind them end (a WhatsApp
 * consent too, since its fallback is SMS and BAJA means stop), and any account with one of them
 * drops `sms`. Pending notices then close as `no_consent` or `not_opted_in` when the dispatcher
 * reaches them. Runs in the caller's transaction if given one; two statements for any number of phones.
 */
export async function optOutFromSms(db: Executor, phones: string[]) {
  if (phones.length === 0) return;
  await db.execute(sql`
    UPDATE worksite_contacts SET notify_channel = NULL, notify_consent_at = NULL
    WHERE phone IN ${phones} AND notify_channel IS NOT NULL`);
  await db.execute(sql`
    UPDATE notification_preferences p SET channels = array_remove(p.channels, 'sms')
    FROM users u
    WHERE u.id = p.user_id AND u.phone IN ${phones} AND 'sms' = ANY(p.channels)`);
}
