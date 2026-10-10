CREATE TYPE "public"."zone_kind" AS ENUM('no_entry', 'restricted', 'meeting_point');--> statement-breakpoint
CREATE TABLE "emergency_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"kind" "zone_kind" NOT NULL,
	"note" text,
	"area" geometry(MultiPolygon, 4326) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	CONSTRAINT "emergency_zones_note_check" CHECK (char_length("emergency_zones"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "emergency_zones" ADD CONSTRAINT "emergency_zones_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_zones" ADD CONSTRAINT "emergency_zones_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_zones" ADD CONSTRAINT "emergency_zones_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_zones_area_idx" ON "emergency_zones" USING gist ("area");--> statement-breakpoint
CREATE INDEX "emergency_zones_active_idx" ON "emergency_zones" USING btree ("emergency_id") WHERE "emergency_zones"."removed_at" IS NULL;