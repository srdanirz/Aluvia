import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * A signed-in device (ADR 0013). The id is the SHA-256 of the cookie token, so a leaked row
 * cannot be replayed as a cookie. Expiry slides forward while the device is in use.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

/**
 * A one-time login code sent to a phone. Phone and code are stored as keyed hashes: a row
 * identifies nobody and gives nothing to whoever reads the table. Verifying is a conditional
 * UPDATE on `attempts` and `consumed_at`, so a code is used once and guessed a bounded number of times.
 */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneHash: text("phone_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    index("login_codes_phone_hash_created_at_idx").on(t.phoneHash, t.createdAt),
    index("login_codes_expires_at_idx").on(t.expiresAt),
    check("login_codes_attempts_check", sql`${t.attempts} >= 0`),
  ],
);
