CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_contact" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_id_emergency_id_key" UNIQUE("id","emergency_id"),
	CONSTRAINT "organizations_name_check" CHECK (char_length(btrim("organizations"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "organizations_public_contact_check" CHECK ("organizations"."public_contact" IS NULL OR char_length(btrim("organizations"."public_contact")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "emergency_members" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_emergency_id_name_key" ON "organizations" USING btree ("emergency_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "organizations_emergency_id_created_at_idx" ON "organizations" USING btree ("emergency_id","created_at");--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_organization_fk" FOREIGN KEY ("organization_id","emergency_id") REFERENCES "public"."organizations"("id","emergency_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_fk" FOREIGN KEY ("organization_id","emergency_id") REFERENCES "public"."organizations"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_members_organization_id_idx" ON "emergency_members" USING btree ("organization_id") WHERE "emergency_members"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invitations_organization_id_idx" ON "invitations" USING btree ("organization_id") WHERE "invitations"."organization_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_organization_check" CHECK ("emergency_members"."organization_id" IS NULL OR "emergency_members"."role" = 'coordinator');--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_check" CHECK ("invitations"."organization_id" IS NULL OR "invitations"."role" = 'coordinator');--> statement-breakpoint
-- By hand, drizzle-kit has no DEFERRABLE: deleting an emergency cascades to its members and its
-- organizations in either order, while a group that still has coordinators cannot be deleted.
ALTER TABLE "emergency_members" ALTER CONSTRAINT "emergency_members_organization_fk" DEFERRABLE INITIALLY DEFERRED;
