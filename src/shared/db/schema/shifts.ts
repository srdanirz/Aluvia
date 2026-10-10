import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { wgs84Point } from "./types";
import { users } from "./users";
import { workTypes } from "./work-types";

/** A volunteer shift with a hard capacity. `filled` only moves inside the sign-up transaction. */
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    workTypeKey: text("work_type_key"),
    meetingPoint: text("meeting_point").notNull(),
    location: wgs84Point("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    filled: integer("filled").notNull().default(0),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    // Postgres caps identifiers at 63 chars; the generated name is longer and would be truncated.
    foreignKey({
      name: "shifts_work_type_fk",
      columns: [t.emergencyId, t.workTypeKey],
      foreignColumns: [workTypes.emergencyId, workTypes.key],
    }).onDelete("restrict"),
    check("shifts_filled_check", sql`${t.filled} >= 0 AND ${t.filled} <= ${t.capacity}`),
    check("shifts_time_check", sql`${t.endsAt} > ${t.startsAt}`),
    index("shifts_emergency_id_starts_at_idx").on(t.emergencyId, t.startsAt),
  ],
);

/** A sign-up. Cancelling sets cancelled_at; signing up again is a new row. */
export const shiftSignups = pgTable(
  "shift_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("shift_signups_active_idx")
      .on(t.shiftId, t.userId)
      .where(sql`${t.cancelledAt} IS NULL`),
    index("shift_signups_shift_id_idx").on(t.shiftId),
    index("shift_signups_user_id_idx").on(t.userId),
  ],
);
