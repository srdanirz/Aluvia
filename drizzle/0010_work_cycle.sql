CREATE TYPE "public"."work_item_event_kind" AS ENUM('status_changed', 'claimed', 'renewed', 'arrived', 'released', 'expired', 'verified');--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD COLUMN "claim_hold_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD COLUMN "kind" "work_item_event_kind" DEFAULT 'status_changed' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "work_items_claim_expires_at_idx" ON "work_items" USING btree ("claim_expires_at") WHERE "work_items"."claim_expires_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD CONSTRAINT "emergency_settings_claim_hold_check" CHECK ("emergency_settings"."claim_hold_minutes" BETWEEN 1 AND 1440);--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_claim_expires_check" CHECK ("work_items"."claim_expires_at" IS NULL OR "work_items"."status" IN ('open_claimed', 'open_partially_done', 'open_needs_follow_up'));