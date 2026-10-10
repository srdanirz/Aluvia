-- work_item_events is the work history (ADR 0005): never edited and never deleted by hand.
-- Allowed: anonymizing actor_id (ON DELETE SET NULL on users, and the personal-data purge), and
-- deletes cascaded from the work item or the emergency (pg_trigger_depth() > 1: the FK action
-- runs inside its own trigger), so removing a test emergency still works.
CREATE FUNCTION work_item_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR (TG_OP = 'DELETE' AND pg_trigger_depth() = 1) THEN
    RAISE EXCEPTION 'work_item_events is append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.work_item_id IS DISTINCT FROM OLD.work_item_id
    OR NEW.emergency_id IS DISTINCT FROM OLD.emergency_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.from_status IS DISTINCT FROM OLD.from_status
    OR NEW.to_status IS DISTINCT FROM OLD.to_status
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'work_item_events only allows anonymizing' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_item_events_guard BEFORE UPDATE OR DELETE ON work_item_events
  FOR EACH ROW EXECUTE FUNCTION work_item_events_guard();
--> statement-breakpoint
CREATE TRIGGER work_item_events_no_truncate BEFORE TRUNCATE ON work_item_events
  FOR EACH STATEMENT EXECUTE FUNCTION work_item_events_guard();
