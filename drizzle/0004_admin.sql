CREATE TABLE "emergency_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid NOT NULL,
	"message" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "emergency_notices_message_check" CHECK (jsonb_typeof("emergency_notices"."message") = 'object' AND "emergency_notices"."message" <> '{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "disaster_types" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "emergencies" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_notices" ADD CONSTRAINT "emergency_notices_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_notices" ADD CONSTRAINT "emergency_notices_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_notices_active_idx" ON "emergency_notices" USING btree ("emergency_id") WHERE "emergency_notices"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE INDEX "emergency_notices_emergency_id_idx" ON "emergency_notices" USING btree ("emergency_id");--> statement-breakpoint
CREATE INDEX "emergencies_created_at_id_idx" ON "emergencies" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "disaster_type_work_types" ADD CONSTRAINT "disaster_type_work_types_key_check" CHECK ("disaster_type_work_types"."key" ~ '^[a-z][a-z0-9_]{1,39}$');--> statement-breakpoint
ALTER TABLE "disaster_type_work_types" ADD CONSTRAINT "disaster_type_work_types_sort_order_check" CHECK ("disaster_type_work_types"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "disaster_types" ADD CONSTRAINT "disaster_types_key_check" CHECK ("disaster_types"."key" ~ '^[a-z][a-z0-9_]{1,39}$');--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_slug_check" CHECK ("emergencies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("emergencies"."slug") <= 60);--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_name_check" CHECK (jsonb_typeof("emergencies"."name") = 'object' AND "emergencies"."name" ? "emergencies"."default_locale");--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_closed_check" CHECK (("emergencies"."status" = 'closed') = ("emergencies"."closed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_area_check" CHECK ("emergencies"."area" IS NULL OR ST_IsValid("emergencies"."area"));--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_key_check" CHECK ("work_types"."key" ~ '^[a-z][a-z0-9_]{1,39}$');