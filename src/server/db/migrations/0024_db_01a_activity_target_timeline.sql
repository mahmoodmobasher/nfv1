LOCK TABLE activity_records, activity_record_references IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM activity_records LIMIT 1)
     OR EXISTS (SELECT 1 FROM activity_record_references LIMIT 1) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'db_01a_activity_tables_must_be_empty';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "activity_record_references" ADD COLUMN "occurred_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "activity_record_references_target_timeline_idx" ON "activity_record_references" USING btree ("workspace_id","record_type","record_id","occurred_at" DESC NULLS LAST,"activity_id" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION activity_reference_derive_occurred_at_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  root_occurred_at timestamptz;
BEGIN
  SELECT occurred_at INTO root_occurred_at
  FROM activity_records
  WHERE workspace_id=NEW.workspace_id AND id=NEW.activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='activity_reference_root_missing';
  END IF;
  IF NEW.occurred_at IS NOT NULL AND NEW.occurred_at IS DISTINCT FROM root_occurred_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='activity_reference_occurred_at_mismatch';
  END IF;
  NEW.occurred_at := root_occurred_at;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER activity_reference_derive_occurred_at_v1
BEFORE INSERT OR UPDATE OF workspace_id,activity_id,occurred_at ON activity_record_references
FOR EACH ROW EXECUTE FUNCTION activity_reference_derive_occurred_at_v1();--> statement-breakpoint
CREATE FUNCTION activity_record_freeze_referenced_occurred_at_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.occurred_at IS DISTINCT FROM OLD.occurred_at AND EXISTS (
    SELECT 1 FROM activity_record_references
    WHERE workspace_id=OLD.workspace_id AND activity_id=OLD.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='referenced_activity_occurred_at_immutable';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER activity_record_freeze_referenced_occurred_at_v1
BEFORE UPDATE OF occurred_at ON activity_records
FOR EACH ROW EXECUTE FUNCTION activity_record_freeze_referenced_occurred_at_v1();
