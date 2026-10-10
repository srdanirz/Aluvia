-- Catalog FKs are checked at commit, after a cascade from emergencies has removed both sides.
-- Each cascade action runs as its own statement, so an immediate check (RESTRICT or plain NO
-- ACTION) fails or passes depending on the order Postgres visits the tables. Deleting a used
-- type on its own is still refused, at commit. drizzle-kit has no DEFERRABLE, hence by hand.
ALTER TABLE "work_items" ALTER CONSTRAINT "work_items_work_type_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "shifts" ALTER CONSTRAINT "shifts_work_type_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "worksite_update_supplies" ALTER CONSTRAINT "worksite_update_supplies_supply_type_fk" DEFERRABLE INITIALLY DEFERRED;
