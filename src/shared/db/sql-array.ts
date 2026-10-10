import { sql } from "drizzle-orm";

/**
 * One typed Postgres array parameter (`ARRAY[$1, $2]::uuid[]`) for unnest or `= ANY(...)`. Drizzle
 * would otherwise spread a JS array into a parenthesized list, which neither accepts.
 */
export function sqlArray(values: readonly string[], type: "uuid" | "text") {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::${sql.raw(type)}[]`;
}
