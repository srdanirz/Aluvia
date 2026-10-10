ALTER TABLE "emergency_settings" ADD COLUMN "stale_after_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
CREATE INDEX "worksites_emergency_id_location_idx" ON "worksites" USING gist ("emergency_id","location");--> statement-breakpoint
ALTER TABLE "emergency_settings" ADD CONSTRAINT "emergency_settings_stale_after_hours_check" CHECK ("emergency_settings"."stale_after_hours" > 0);