CREATE TABLE "report_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"emergency_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_receipts" ADD CONSTRAINT "report_receipts_emergency_id_emergencies_id_fk" FOREIGN KEY ("emergency_id") REFERENCES "public"."emergencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_receipts" ADD CONSTRAINT "report_receipts_worksite_fk" FOREIGN KEY ("worksite_id","emergency_id") REFERENCES "public"."worksites"("id","emergency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_receipts_worksite_id_idx" ON "report_receipts" USING btree ("worksite_id");