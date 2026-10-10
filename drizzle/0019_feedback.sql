CREATE TYPE "public"."feedback_category" AS ENUM('problem', 'idea', 'other');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emergency_id" uuid,
	"category" "feedback_category" NOT NULL,
	"message" text NOT NULL,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_message_check" CHECK (char_length("feedback"."message") BETWEEN 1 AND 1000),
	CONSTRAINT "feedback_contact_check" CHECK (char_length("feedback"."contact") <= 200)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_at_id_idx" ON "feedback" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_emergency_id_idx" ON "feedback" USING btree ("emergency_id");