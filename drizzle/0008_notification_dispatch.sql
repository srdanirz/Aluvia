CREATE TABLE "notification_daily_usage" (
	"emergency_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"day" date NOT NULL,
	"user_count" integer DEFAULT 0 NOT NULL,
	"neighbor_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "notification_daily_usage_emergency_id_channel_day_pk" PRIMARY KEY("emergency_id","channel","day"),
	CONSTRAINT "notification_daily_usage_counts_check" CHECK ("notification_daily_usage"."user_count" >= 0 AND "notification_daily_usage"."neighbor_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_reports" (
	"provider_message_id" text PRIMARY KEY NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"code" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "notifications_pending_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "notification_daily_usage" ADD CONSTRAINT "notification_daily_usage_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_provider_message_id_idx" ON "notifications" USING btree ("provider_message_id") WHERE "notifications"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_emergency_id_failed_at_idx" ON "notifications" USING btree ("emergency_id","failed_at","id") WHERE "notifications"."worksite_id" IS NOT NULL AND "notifications"."failed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "worksite_contacts_phone_idx" ON "worksite_contacts" USING btree ("phone") WHERE "worksite_contacts"."notify_channel" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("not_before") WHERE "notifications"."sent_at" IS NULL AND "notifications"."failed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_failure_check" CHECK (("notifications"."failed_at" IS NULL) = ("notifications"."failure_code" IS NULL));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_terminal_check" CHECK ("notifications"."sent_at" IS NULL OR "notifications"."failed_at" IS NULL);