CREATE TYPE "public"."damage_level" AS ENUM('minor', 'moderate', 'severe', 'uninhabitable');--> statement-breakpoint
CREATE TYPE "public"."emergency_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('volunteer', 'coordinator');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_level" AS ENUM('important', 'shift_reminder', 'normal', 'digest');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "public"."report_source" AS ENUM('neighbor', 'coordinator', 'social');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('open_unclaimed', 'open_claimed', 'open_partially_done', 'open_needs_follow_up', 'closed_done', 'closed_done_by_others', 'closed_no_help_wanted', 'closed_duplicate');--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"emergency_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"user_id" uuid,
	"worksite_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disaster_type_work_types" (
	"disaster_type_key" text NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "disaster_type_work_types_disaster_type_key_key_pk" PRIMARY KEY("disaster_type_key","key")
);
--> statement-breakpoint
CREATE TABLE "disaster_types" (
	"key" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"disaster_type_key" text NOT NULL,
	"name" jsonb NOT NULL,
	"default_locale" text NOT NULL,
	"time_zone" text NOT NULL,
	"comunas" text[] DEFAULT '{}'::text[] NOT NULL,
	"area" geometry(MultiPolygon, 4326),
	"status" "emergency_status" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"personal_data_delete_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergencies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "emergencies_default_locale_check" CHECK ("emergencies"."default_locale" ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "emergency_settings" (
	"emergency_id" uuid PRIMARY KEY NOT NULL,
	"sms_daily_cap" integer DEFAULT 0 NOT NULL,
	"whatsapp_daily_cap" integer DEFAULT 0 NOT NULL,
	"neighbor_reserve" integer DEFAULT 0 NOT NULL,
	"official_contact" text,
	"official_survey_name" text,
	CONSTRAINT "emergency_settings_caps_check" CHECK ("emergency_settings"."sms_daily_cap" >= 0 AND "emergency_settings"."whatsapp_daily_cap" >= 0 AND "emergency_settings"."neighbor_reserve" >= 0)
);
--> statement-breakpoint
CREATE TABLE "emergency_members" (
	"emergency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'volunteer' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	CONSTRAINT "emergency_members_emergency_id_user_id_pk" PRIMARY KEY("emergency_id","user_id"),
	CONSTRAINT "emergency_members_approver_check" CHECK ("emergency_members"."approved_by" <> "emergency_members"."user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"channels" "notification_channel"[] DEFAULT '{push}'::notification_channel[] NOT NULL,
	"quiet_hours" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"user_id" uuid,
	"worksite_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"level" "notification_level" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_event_recipient_channel_key" UNIQUE NULLS NOT DISTINCT("event_key","user_id","worksite_id","channel"),
	CONSTRAINT "notifications_one_recipient_check" CHECK (("notifications"."user_id" IS NULL) <> ("notifications"."worksite_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "shift_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid NOT NULL,
	"work_type_key" text,
	"meeting_point" text NOT NULL,
	"location" geometry(Point, 4326),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"filled" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shifts_filled_check" CHECK ("shifts"."filled" >= 0 AND "shifts"."filled" <= "shifts"."capacity"),
	CONSTRAINT "shifts_time_check" CHECK ("shifts"."ends_at" > "shifts"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"locale" text,
	"platform_role" "platform_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_check" CHECK ("users"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "work_item_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"emergency_id" uuid NOT NULL,
	"from_status" "work_item_status",
	"to_status" "work_item_status" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"work_type_key" text NOT NULL,
	"status" "work_item_status" DEFAULT 'open_unclaimed' NOT NULL,
	"claimed_by" uuid,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_id_emergency_id_key" UNIQUE("id","emergency_id"),
	CONSTRAINT "work_items_unclaimed_check" CHECK ("work_items"."status" <> 'open_unclaimed' OR "work_items"."claimed_by" IS NULL),
	CONSTRAINT "work_items_verified_check" CHECK ("work_items"."verified_by" IS NULL OR "work_items"."verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"emergency_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "work_types_emergency_id_key_pk" PRIMARY KEY("emergency_id","key")
);
--> statement-breakpoint
CREATE TABLE "worksite_contacts" (
	"worksite_id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"phone" text,
	"address_text" text,
	"notes" text,
	"locale" text,
	"notify_channel" "notification_channel",
	"notify_consent_at" timestamp with time zone,
	CONSTRAINT "worksite_contacts_phone_check" CHECK ("worksite_contacts"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "worksite_contacts_locale_check" CHECK ("worksite_contacts"."locale" ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
	CONSTRAINT "worksite_contacts_consent_check" CHECK (("worksite_contacts"."notify_channel" IS NULL AND "worksite_contacts"."notify_consent_at" IS NULL) OR ("worksite_contacts"."notify_channel" IN ('sms', 'whatsapp') AND "worksite_contacts"."notify_consent_at" IS NOT NULL AND "worksite_contacts"."phone" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "worksites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"damage_level" "damage_level",
	"has_vulnerable_people" boolean DEFAULT false NOT NULL,
	"official_survey_done" boolean DEFAULT false NOT NULL,
	"source" "report_source" NOT NULL,
	"unclaimed_since" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksites_id_emergency_id_key" UNIQUE("id","emergency_id")
);
--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_views" ADD CONSTRAINT "contact_views_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_views" ADD CONSTRAINT "contact_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_views" ADD CONSTRAINT "contact_views_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disaster_type_work_types" ADD CONSTRAINT "disaster_type_work_types_disaster_type_fk" FOREIGN KEY ("disaster_type_key") REFERENCES "public"."disaster_types"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_disaster_type_key_disaster_types_key_fk" FOREIGN KEY ("disaster_type_key") REFERENCES "public"."disaster_types"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD CONSTRAINT "emergency_settings_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_work_type_fk" FOREIGN KEY ("emergency_id","work_type_key") REFERENCES "public"."work_types"("emergency_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_work_item_fk" FOREIGN KEY ("work_item_id","emergency_id") REFERENCES "public"."work_items"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_work_type_fk" FOREIGN KEY ("emergency_id","work_type_key") REFERENCES "public"."work_types"("emergency_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_contacts" ADD CONSTRAINT "worksite_contacts_worksite_id_worksites_id_fk" FOREIGN KEY ("worksite_id") REFERENCES "public"."worksites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_events_emergency_id_idx" ON "admin_events" USING btree ("emergency_id");--> statement-breakpoint
CREATE INDEX "contact_views_worksite_id_idx" ON "contact_views" USING btree ("worksite_id");--> statement-breakpoint
CREATE INDEX "contact_views_emergency_id_idx" ON "contact_views" USING btree ("emergency_id");--> statement-breakpoint
CREATE INDEX "emergencies_area_idx" ON "emergencies" USING gist ("area");--> statement-breakpoint
CREATE INDEX "emergency_members_user_id_idx" ON "emergency_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_emergency_id_idx" ON "notifications" USING btree ("emergency_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_worksite_id_idx" ON "notifications" USING btree ("worksite_id");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("not_before") WHERE "notifications"."sent_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_signups_active_idx" ON "shift_signups" USING btree ("shift_id","user_id") WHERE "shift_signups"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shift_signups_shift_id_idx" ON "shift_signups" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_signups_user_id_idx" ON "shift_signups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shifts_emergency_id_starts_at_idx" ON "shifts" USING btree ("emergency_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "work_item_events_work_item_id_idx" ON "work_item_events" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "work_items_emergency_id_status_idx" ON "work_items" USING btree ("emergency_id","status");--> statement-breakpoint
CREATE INDEX "work_items_worksite_id_idx" ON "work_items" USING btree ("worksite_id");--> statement-breakpoint
CREATE INDEX "work_items_claimed_by_idx" ON "work_items" USING btree ("claimed_by");--> statement-breakpoint
CREATE INDEX "worksites_location_idx" ON "worksites" USING gist ("location");--> statement-breakpoint
CREATE INDEX "worksites_emergency_id_unclaimed_since_idx" ON "worksites" USING btree ("emergency_id","unclaimed_since") WHERE "worksites"."unclaimed_since" IS NOT NULL;