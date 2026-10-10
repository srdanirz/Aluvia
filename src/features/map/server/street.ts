import { type SQL, sql } from "drizzle-orm";

/**
 * The street of a written address with every digit and what follows cut off: enough for a volunteer
 * to find the block, never the door (ADR 0011). Null when nothing is left. The only public reading
 * of `worksite_contacts.address_text`; `address` is that column.
 */
export function streetWithoutNumberSql(address: SQL): SQL {
  return sql`initcap(nullif(btrim(regexp_replace(${address}, '\s*[0-9].*$', '')), ''))`;
}
