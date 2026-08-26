CREATE TABLE "note_record_references" (
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"relationship_role" text DEFAULT 'related' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_record_references_pk" PRIMARY KEY("workspace_id","note_id","record_type","record_id"),
	CONSTRAINT "note_record_references_type_check" CHECK ("note_record_references"."record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')),
	CONSTRAINT "note_record_references_role_check" CHECK ("note_record_references"."relationship_role"='related')
);
--> statement-breakpoint
CREATE TABLE "note_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision_number" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"redacted_at" timestamp with time zone,
	"redacted_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_records_lifecycle_check" CHECK ("note_records"."lifecycle" in ('active','archived','redacted')),
	CONSTRAINT "note_records_version_check" CHECK ("note_records"."version">0 and "note_records"."current_revision_number"="note_records"."version"),
	CONSTRAINT "note_records_lifecycle_metadata_check" CHECK (("note_records"."lifecycle"='active' and num_nonnulls("note_records"."archived_at","note_records"."archived_by_membership_id","note_records"."redacted_at","note_records"."redacted_by_membership_id")=0) or ("note_records"."lifecycle"='archived' and "note_records"."archived_at" is not null and "note_records"."archived_by_membership_id" is not null and "note_records"."redacted_at" is null and "note_records"."redacted_by_membership_id" is null) or ("note_records"."lifecycle"='redacted' and "note_records"."redacted_at" is not null and "note_records"."redacted_by_membership_id" is not null and (("note_records"."archived_at" is null and "note_records"."archived_by_membership_id" is null) or ("note_records"."archived_at" is not null and "note_records"."archived_by_membership_id" is not null))))
);
--> statement-breakpoint
CREATE TABLE "note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"subject" text,
	"body" text,
	"redaction_marker" text,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_revisions_number_check" CHECK ("note_revisions"."revision_number">0),
	CONSTRAINT "note_revisions_content_check" CHECK (("note_revisions"."redaction_marker" is null and ("note_revisions"."subject" is null or char_length(btrim("note_revisions"."subject")) between 1 and 200) and "note_revisions"."body" is not null and char_length(btrim("note_revisions"."body")) between 1 and 20000) or ("note_revisions"."redaction_marker"='content_redacted' and "note_revisions"."subject" is null and "note_revisions"."body" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "note_records_workspace_id_id_uq" ON "note_records" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "note_record_references" ADD CONSTRAINT "note_record_references_note_fk" FOREIGN KEY ("workspace_id","note_id") REFERENCES "public"."note_records"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_record_references" ADD CONSTRAINT "note_record_references_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_records" ADD CONSTRAINT "note_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_records" ADD CONSTRAINT "note_records_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_records" ADD CONSTRAINT "note_records_workspace_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_records" ADD CONSTRAINT "note_records_workspace_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_records" ADD CONSTRAINT "note_records_workspace_redactor_fk" FOREIGN KEY ("workspace_id","redacted_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_fk" FOREIGN KEY ("workspace_id","note_id") REFERENCES "public"."note_records"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_record_references_target_idx" ON "note_record_references" USING btree ("workspace_id","record_type","record_id","note_id");--> statement-breakpoint
CREATE INDEX "note_records_workspace_lifecycle_updated_idx" ON "note_records" USING btree ("workspace_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "note_revisions_workspace_id_id_uq" ON "note_revisions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_revisions_workspace_note_number_uq" ON "note_revisions" USING btree ("workspace_id","note_id","revision_number");--> statement-breakpoint
CREATE FUNCTION note_records_enforce_version_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 OR NEW.current_revision_number<>1 OR NEW.lifecycle<>'active' THEN
      RAISE EXCEPTION 'note_record_must_start_active_at_version_one';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR
     NEW.created_by_membership_id <> OLD.created_by_membership_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'note_record_identity_immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 OR NEW.current_revision_number <> OLD.current_revision_number + 1 THEN
    RAISE EXCEPTION 'note_record_version_must_advance_once';
  END IF;
  IF NEW.governing_operation_id = OLD.governing_operation_id THEN
    RAISE EXCEPTION 'note_record_operation_must_advance';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER note_records_enforce_version_v1 BEFORE INSERT OR UPDATE ON note_records
FOR EACH ROW EXECUTE FUNCTION note_records_enforce_version_v1();--> statement-breakpoint
CREATE FUNCTION note_revisions_append_only_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'note_revisions_append_only';
END $$;--> statement-breakpoint
CREATE TRIGGER note_revisions_append_only_v1 BEFORE UPDATE OR DELETE ON note_revisions
FOR EACH ROW EXECUTE FUNCTION note_revisions_append_only_v1();--> statement-breakpoint
CREATE FUNCTION note_records_require_current_revision_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_marker text;
BEGIN
  SELECT redaction_marker INTO revision_marker
  FROM note_revisions
  WHERE workspace_id=NEW.workspace_id AND note_id=NEW.id
    AND revision_number=NEW.current_revision_number
    AND governing_operation_id=NEW.governing_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'note_current_revision_required';
  END IF;
  IF (NEW.lifecycle='redacted' AND revision_marker IS DISTINCT FROM 'content_redacted') OR
     (NEW.lifecycle<>'redacted' AND revision_marker IS NOT NULL) THEN
    RAISE EXCEPTION 'note_revision_lifecycle_mismatch';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER note_records_require_current_revision_v1
AFTER INSERT OR UPDATE ON note_records DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION note_records_require_current_revision_v1();--> statement-breakpoint
CREATE FUNCTION note_revisions_require_root_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_revision integer; root_operation uuid;
BEGIN
  SELECT current_revision_number,governing_operation_id INTO root_revision,root_operation
  FROM note_records WHERE workspace_id=NEW.workspace_id AND id=NEW.note_id;
  IF NOT FOUND OR NEW.revision_number > root_revision OR
     (NEW.revision_number=root_revision AND NEW.governing_operation_id<>root_operation) THEN
    RAISE EXCEPTION 'note_revision_root_mismatch';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER note_revisions_require_root_v1
AFTER INSERT ON note_revisions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION note_revisions_require_root_v1();
