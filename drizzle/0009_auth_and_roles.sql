ALTER TYPE "public"."member_role" ADD VALUE 'field_volunteer';--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "login_codes_attempts_check" CHECK ("login_codes"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_worksites" (
	"invitation_id" uuid NOT NULL,
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	CONSTRAINT "invitation_worksites_invitation_id_worksite_id_pk" PRIMARY KEY("invitation_id","worksite_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_id_emergency_id_key" UNIQUE("id","emergency_id"),
	CONSTRAINT "invitations_expiry_check" CHECK ("invitations"."expires_at" > "invitations"."created_at"),
	CONSTRAINT "invitations_uses_check" CHECK ("invitations"."uses" >= 0 AND ("invitations"."max_uses" IS NULL OR ("invitations"."max_uses" > 0 AND "invitations"."uses" <= "invitations"."max_uses"))),
	CONSTRAINT "invitations_elevated_check" CHECK ("invitations"."role" = 'volunteer' OR "invitations"."max_uses" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "worksite_assignments" (
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksite_assignments_worksite_id_user_id_pk" PRIMARY KEY("worksite_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_members" ADD COLUMN "requested_role" "member_role";--> statement-breakpoint
ALTER TABLE "emergency_members" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_worksites" ADD CONSTRAINT "invitation_worksites_invitation_fk" FOREIGN KEY ("invitation_id","emergency_id") REFERENCES "public"."invitations"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_worksites" ADD CONSTRAINT "invitation_worksites_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_assignments" ADD CONSTRAINT "worksite_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_assignments" ADD CONSTRAINT "worksite_assignments_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_assignments" ADD CONSTRAINT "worksite_assignments_member_fk" FOREIGN KEY ("emergency_id","user_id") REFERENCES "public"."emergency_members"("emergency_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_codes_phone_hash_created_at_idx" ON "login_codes" USING btree ("phone_hash","created_at");--> statement-breakpoint
CREATE INDEX "login_codes_expires_at_idx" ON "login_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invitation_worksites_worksite_id_idx" ON "invitation_worksites" USING btree ("worksite_id");--> statement-breakpoint
CREATE INDEX "invitations_emergency_id_created_at_idx" ON "invitations" USING btree ("emergency_id","created_at");--> statement-breakpoint
CREATE INDEX "worksite_assignments_emergency_id_user_id_idx" ON "worksite_assignments" USING btree ("emergency_id","user_id");--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_claimant_fk" FOREIGN KEY ("emergency_id","claimed_by") REFERENCES "public"."emergency_members"("emergency_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_members_elevated_idx" ON "emergency_members" USING btree ("emergency_id","approved_at") WHERE "emergency_members"."role" <> 'volunteer';--> statement-breakpoint
CREATE INDEX "emergency_members_pending_idx" ON "emergency_members" USING btree ("emergency_id","created_at") WHERE "emergency_members"."requested_role" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_elevated_check" CHECK ("emergency_members"."role" = 'volunteer' OR "emergency_members"."approved_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "emergency_members" ADD CONSTRAINT "emergency_members_requested_role_check" CHECK ("emergency_members"."requested_role" IS NULL OR ("emergency_members"."requested_role" <> 'volunteer' AND "emergency_members"."requested_role" <> "emergency_members"."role"));