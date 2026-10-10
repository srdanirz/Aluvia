CREATE TYPE "public"."worksite_hazard" AS ENUM('electricity', 'gas', 'structure');--> statement-breakpoint
CREATE TYPE "public"."worksite_review_flag" AS ENUM('outside_area', 'possible_duplicate', 'person_in_danger');--> statement-breakpoint
ALTER TYPE "public"."report_source" ADD VALUE 'official';--> statement-breakpoint
CREATE TABLE "disaster_type_supply_types" (
	"disaster_type_key" text NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "disaster_type_supply_types_disaster_type_key_key_pk" PRIMARY KEY("disaster_type_key","key"),
	CONSTRAINT "disaster_type_supply_types_key_check" CHECK ("disaster_type_supply_types"."key" ~ '^[a-z][a-z0-9_]{1,39}$'),
	CONSTRAINT "disaster_type_supply_types_sort_order_check" CHECK ("disaster_type_supply_types"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_types" (
	"emergency_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "supply_types_emergency_id_key_pk" PRIMARY KEY("emergency_id","key"),
	CONSTRAINT "supply_types_key_check" CHECK ("supply_types"."key" ~ '^[a-z][a-z0-9_]{1,39}$')
);
--> statement-breakpoint
CREATE TABLE "worksite_update_supplies" (
	"update_id" uuid NOT NULL,
	"emergency_id" uuid NOT NULL,
	"supply_type_key" text NOT NULL,
	CONSTRAINT "worksite_update_supplies_update_id_supply_type_key_pk" PRIMARY KEY("update_id","supply_type_key")
);
--> statement-breakpoint
CREATE TABLE "worksite_updates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"people_present" integer NOT NULL,
	"reported_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksite_updates_id_emergency_id_key" UNIQUE("id","emergency_id"),
	CONSTRAINT "worksite_updates_people_present_check" CHECK ("worksite_updates"."people_present" BETWEEN 0 AND 500),
	CONSTRAINT "worksite_updates_cancelled_check" CHECK ("worksite_updates"."cancelled_by" IS NULL OR "worksite_updates"."cancelled_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "worksites" ALTER COLUMN "location" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD COLUMN "emergency_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "review_flags" "worksite_review_flag"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "hazards" "worksite_hazard"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "hazards_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "hazards_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "disaster_type_supply_types" ADD CONSTRAINT "disaster_type_supply_types_disaster_type_fk" FOREIGN KEY ("disaster_type_key") REFERENCES "public"."disaster_types"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_types" ADD CONSTRAINT "supply_types_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_update_supplies" ADD CONSTRAINT "worksite_update_supplies_update_fk" FOREIGN KEY ("update_id","emergency_id") REFERENCES "public"."worksite_updates"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_update_supplies" ADD CONSTRAINT "worksite_update_supplies_supply_type_fk" FOREIGN KEY ("emergency_id","supply_type_key") REFERENCES "public"."supply_types"("emergency_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD CONSTRAINT "worksite_updates_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD CONSTRAINT "worksite_updates_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD CONSTRAINT "worksite_updates_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_updates" ADD CONSTRAINT "worksite_updates_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worksite_updates_worksite_id_created_at_idx" ON "worksite_updates" USING btree ("worksite_id","created_at" DESC NULLS LAST) WHERE "worksite_updates"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_hazards_reviewed_by_users_id_fk" FOREIGN KEY ("hazards_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worksites_location_geography_idx" ON "worksites" USING gist (("location"::geography));--> statement-breakpoint
CREATE INDEX "worksites_emergency_id_review_idx" ON "worksites" USING btree ("emergency_id","created_at") WHERE cardinality("worksites"."review_flags") > 0;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_hazards_reviewed_check" CHECK ("worksites"."hazards_reviewed_by" IS NULL OR "worksites"."hazards_reviewed_at" IS NOT NULL);