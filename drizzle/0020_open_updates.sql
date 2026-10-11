ALTER TYPE "public"."work_item_event_kind" ADD VALUE 'status_reverted';--> statement-breakpoint
ALTER TABLE "work_item_events" ADD COLUMN "device_key" text;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD COLUMN "ip_key" text;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD COLUMN "previous_update_id" uuid;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD COLUMN "device_key" text;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD COLUMN "ip_key" text;--> statement-breakpoint
CREATE INDEX "worksite_updates_worksite_id_history_idx" ON "worksite_updates" USING btree ("worksite_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);