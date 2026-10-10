-- admin_events is an append-only log (ADR 0009): no row is deleted and none is edited.
-- The only allowed update is anonymizing: the ON DELETE SET NULL foreign keys null actor_id and
-- emergency_id, and the personal-data purge (ADR 0005) nulls target_id, which has no foreign key.
CREATE FUNCTION admin_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'admin_events is append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.target_type IS DISTINCT FROM OLD.target_type
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
    OR (NEW.target_id IS DISTINCT FROM OLD.target_id AND NEW.target_id IS NOT NULL)
    OR (NEW.emergency_id IS DISTINCT FROM OLD.emergency_id AND NEW.emergency_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'admin_events only allows anonymizing' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER admin_events_guard BEFORE UPDATE OR DELETE ON admin_events
  FOR EACH ROW EXECUTE FUNCTION admin_events_guard();
--> statement-breakpoint
CREATE TRIGGER admin_events_no_truncate BEFORE TRUNCATE ON admin_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_events_guard();
