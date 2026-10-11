import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { mediaKind, mediaStatus } from "./enums";
import { users } from "./users";
import { worksites } from "./worksites";

/**
 * Photos and short videos of a home (ADR 0020). The bytes live in the private media bucket; a row
 * holds where and what. `object_key` is the re-encoded copy the public sees, set when the server
 * finishes processing; the browser's original never is public. Hidden items stay for coordinators
 * and free their slot. Rows go with the emergency's purge, and their objects through
 * media_object_deletions.
 */
export const worksiteMedia = pgTable(
  "worksite_media",
  {
    // Client-generated, so the outbox can retry the upload without a second row.
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id").notNull(),
    kind: mediaKind("kind").notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    // What the browser declared; the signed upload URL binds it.
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: real("duration_seconds"),
    objectKey: text("object_key"),
    // Null for an anonymous neighbor; anonymized with the purge (which deletes the row anyway).
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "worksite_media_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    unique("worksite_media_id_emergency_id_key").on(t.id, t.emergencyId),
    // 50 MB: a 30 s phone video at 1080p fits; the bucket rejects a larger body by signature.
    check("worksite_media_size_check", sql`${t.sizeBytes} BETWEEN 1 AND 52428800`),
    check(
      "worksite_media_duration_check",
      sql`${t.durationSeconds} IS NULL OR (${t.kind} = 'video' AND ${t.durationSeconds} BETWEEN 0 AND 30.5)`,
    ),
    check("worksite_media_ready_check", sql`(${t.status} = 'ready') = (${t.objectKey} IS NOT NULL)`),
    check("worksite_media_hidden_check", sql`${t.hiddenBy} IS NULL OR ${t.hiddenAt} IS NOT NULL`),
    // A home's gallery and its per-home limits read this, newest last.
    index("worksite_media_worksite_id_created_at_idx").on(t.worksiteId, t.createdAt),
  ],
);

/**
 * Bucket objects to delete, filled in the same transaction that drops their rows (the purge,
 * an abandoned upload). A scheduled call empties it: a storage call never runs inside a
 * transaction (STYLEGUIDE, Robustez). Keys only, no personal data.
 */
export const mediaObjectDeletions = pgTable("media_object_deletions", {
  objectKey: text("object_key").primaryKey(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
});
