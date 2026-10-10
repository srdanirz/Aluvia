CREATE TYPE "public"."collection_point_status" AS ENUM('receiving', 'full', 'only_some');--> statement-breakpoint
CREATE TABLE "collection_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"address" text,
	"opening_hours" text,
	"accepts" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "collection_point_status" DEFAULT 'receiving' NOT NULL,
	"status_note" text,
	"phone" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "collection_points_name_check" CHECK (char_length("collection_points"."name") BETWEEN 1 AND 80),
	CONSTRAINT "collection_points_address_check" CHECK (char_length("collection_points"."address") <= 200),
	CONSTRAINT "collection_points_opening_hours_check" CHECK (char_length("collection_points"."opening_hours") <= 120),
	CONSTRAINT "collection_points_status_note_check" CHECK (char_length("collection_points"."status_note") <= 200),
	CONSTRAINT "collection_points_accepts_check" CHECK (cardinality("collection_points"."accepts") <= 40),
	CONSTRAINT "collection_points_phone_check" CHECK ("collection_points"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "collection_points_version_check" CHECK ("collection_points"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "collection_points" ADD CONSTRAINT "collection_points_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_points" ADD CONSTRAINT "collection_points_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_points" ADD CONSTRAINT "collection_points_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_points_location_idx" ON "collection_points" USING gist ("location");--> statement-breakpoint
CREATE INDEX "collection_points_active_idx" ON "collection_points" USING btree ("emergency_id","created_at") WHERE "collection_points"."removed_at" IS NULL;