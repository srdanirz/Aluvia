CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "media_object_deletions" (
	"object_key" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worksite_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" real,
	"object_key" text,
	"uploaded_by" uuid,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "worksite_media_id_emergency_id_key" UNIQUE("id","emergency_id"),
	CONSTRAINT "worksite_media_size_check" CHECK ("worksite_media"."size_bytes" BETWEEN 1 AND 52428800),
	CONSTRAINT "worksite_media_duration_check" CHECK ("worksite_media"."duration_seconds" IS NULL OR ("worksite_media"."kind" = 'video' AND "worksite_media"."duration_seconds" BETWEEN 0 AND 30.5)),
	CONSTRAINT "worksite_media_ready_check" CHECK (("worksite_media"."status" = 'ready') = ("worksite_media"."object_key" IS NOT NULL)),
	CONSTRAINT "worksite_media_hidden_check" CHECK ("worksite_media"."hidden_by" IS NULL OR "worksite_media"."hidden_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "worksite_media" ADD CONSTRAINT "worksite_media_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_media" ADD CONSTRAINT "worksite_media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_media" ADD CONSTRAINT "worksite_media_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_media" ADD CONSTRAINT "worksite_media_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worksite_media_worksite_id_created_at_idx" ON "worksite_media" USING btree ("worksite_id","created_at");