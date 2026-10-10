import { type SQL, sql } from "drizzle-orm";

/**
 * The written address as the public reads it, number included, so a volunteer finds the door
 * (ADR 0017). Trimmed and in title case; null when empty. `address` is
 * `worksite_contacts.address_text`.
 */
export function publicAddressSql(address: SQL): SQL {
  return sql`initcap(nullif(btrim(${address}), ''))`;
}

/**
 * Name or phone of a home's contact for the public: only when the reporter opted in
 * (`worksite_contacts.public_contact`), null otherwise. `contact` is the table's alias.
 */
export function publicContactSql(contact: string, column: "name" | "phone"): SQL {
  return sql.raw(`CASE WHEN ${contact}.public_contact THEN ${contact}.${column} END`);
}
