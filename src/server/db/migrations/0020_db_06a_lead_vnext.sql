CREATE TABLE "lead_authority_states" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"active_writer" text DEFAULT 'p1a' NOT NULL,
	"migration_state" text DEFAULT 'dormant' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"cutover_run_id" uuid,
	"switched_at" timestamp with time zone,
	"switched_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_authority_states_state_check" CHECK ("lead_authority_states"."active_writer" in ('p1a','vnext') and "lead_authority_states"."migration_state" in ('dormant','shadow','reconciling','ready','observing','retirement_ready') and "lead_authority_states"."version">0 and (("lead_authority_states"."active_writer"='p1a' and "lead_authority_states"."migration_state" in ('dormant','shadow','reconciling') and "lead_authority_states"."switched_at" is null and "lead_authority_states"."switched_by_membership_id" is null) or ("lead_authority_states"."active_writer"='p1a' and "lead_authority_states"."migration_state"='ready' and "lead_authority_states"."cutover_run_id" is not null and "lead_authority_states"."switched_at" is null and "lead_authority_states"."switched_by_membership_id" is null) or ("lead_authority_states"."active_writer"='vnext' and "lead_authority_states"."migration_state" in ('observing','retirement_ready') and "lead_authority_states"."cutover_run_id" is not null and "lead_authority_states"."switched_at" is not null and "lead_authority_states"."switched_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "lead_vnext_mappings" (
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"source_contract_version" text DEFAULT 'p1a-lead-v1' NOT NULL,
	"target_contract_version" text DEFAULT 'lead-vnext-v1' NOT NULL,
	"source_version" integer NOT NULL,
	"verified_source_version" integer,
	"state" text DEFAULT 'pending' NOT NULL,
	"reconciliation_run_id" uuid NOT NULL,
	"issue_count" bigint DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"governing_operation_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_vnext_mappings_pk" PRIMARY KEY("workspace_id","lead_id"),
	CONSTRAINT "lead_vnext_mappings_contract_check" CHECK ("lead_vnext_mappings"."source_contract_version"='p1a-lead-v1' and "lead_vnext_mappings"."target_contract_version"='lead-vnext-v1'),
	CONSTRAINT "lead_vnext_mappings_shape_check" CHECK ("lead_vnext_mappings"."source_version">0 and ("lead_vnext_mappings"."verified_source_version" is null or "lead_vnext_mappings"."verified_source_version">0) and "lead_vnext_mappings"."issue_count" between 0 and 9007199254740991 and "lead_vnext_mappings"."version">0 and "lead_vnext_mappings"."state" in ('pending','verified','stale','blocked') and (("lead_vnext_mappings"."state"='pending' and "lead_vnext_mappings"."verified_source_version" is null and "lead_vnext_mappings"."verified_at" is null and "lead_vnext_mappings"."issue_count"=0) or ("lead_vnext_mappings"."state"='verified' and "lead_vnext_mappings"."verified_source_version"="lead_vnext_mappings"."source_version" and "lead_vnext_mappings"."verified_at" is not null and "lead_vnext_mappings"."issue_count"=0) or ("lead_vnext_mappings"."state"='stale' and ("lead_vnext_mappings"."verified_source_version" is null or "lead_vnext_mappings"."verified_source_version"<"lead_vnext_mappings"."source_version")) or ("lead_vnext_mappings"."state"='blocked' and "lead_vnext_mappings"."issue_count">0)))
);
--> statement-breakpoint
CREATE TABLE "lead_vnext_reconciliation_checkpoints" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stream" text NOT NULL,
	"last_sort_at" timestamp with time zone,
	"last_id" uuid,
	"processed_count" bigint DEFAULT 0 NOT NULL,
	"issue_count" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_vnext_reconciliation_checkpoints_pk" PRIMARY KEY("workspace_id","run_id","stream"),
	CONSTRAINT "lead_vnext_reconciliation_checkpoints_stream_check" CHECK ("lead_vnext_reconciliation_checkpoints"."stream" in ('lead_root','intake','identity_review','visibility','lead_history','platform_evidence')),
	CONSTRAINT "lead_vnext_reconciliation_checkpoints_cursor_check" CHECK (("lead_vnext_reconciliation_checkpoints"."last_sort_at" is null)=("lead_vnext_reconciliation_checkpoints"."last_id" is null)),
	CONSTRAINT "lead_vnext_reconciliation_checkpoints_counts_check" CHECK ("lead_vnext_reconciliation_checkpoints"."processed_count" between 0 and 9007199254740991 and "lead_vnext_reconciliation_checkpoints"."issue_count" between 0 and 9007199254740991 and "lead_vnext_reconciliation_checkpoints"."version">0)
);
--> statement-breakpoint
CREATE TABLE "lead_vnext_reconciliation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stream" text NOT NULL,
	"source_record_type" text NOT NULL,
	"source_record_id" uuid NOT NULL,
	"issue_code" text NOT NULL,
	"expected_version" integer,
	"observed_version" integer,
	"related_record_id" uuid,
	"safe_code" text,
	"state" text DEFAULT 'open' NOT NULL,
	"resolution_code" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_vnext_reconciliation_issues_stream_check" CHECK ("lead_vnext_reconciliation_issues"."stream" in ('lead_root','intake','identity_review','visibility','lead_history','platform_evidence')),
	CONSTRAINT "lead_vnext_reconciliation_issues_source_check" CHECK ("lead_vnext_reconciliation_issues"."source_record_type" in ('lead','lead_intake','identity_review','lead_visible_team','lead_activity','audit_event','outbox_message')),
	CONSTRAINT "lead_vnext_reconciliation_issues_code_check" CHECK ("lead_vnext_reconciliation_issues"."issue_code" in ('missing_intake','multiple_intakes','lifecycle_status_ambiguous','lifecycle_definition_unavailable','stage_unavailable','assignment_unavailable','visibility_invalid','identity_review_lineage_invalid','linked_record_workspace_mismatch','history_gap','evidence_cardinality_mismatch','source_version_changed','authority_conflict','unsupported_legacy_row')),
	CONSTRAINT "lead_vnext_reconciliation_issues_versions_check" CHECK (("lead_vnext_reconciliation_issues"."expected_version" is null or "lead_vnext_reconciliation_issues"."expected_version">0) and ("lead_vnext_reconciliation_issues"."observed_version" is null or "lead_vnext_reconciliation_issues"."observed_version">0) and "lead_vnext_reconciliation_issues"."version">0),
	CONSTRAINT "lead_vnext_reconciliation_issues_safe_code_check" CHECK ("lead_vnext_reconciliation_issues"."safe_code" is null or ("lead_vnext_reconciliation_issues"."safe_code"=btrim("lead_vnext_reconciliation_issues"."safe_code") and length("lead_vnext_reconciliation_issues"."safe_code") between 1 and 80 and "lead_vnext_reconciliation_issues"."safe_code" ~ '^[a-z0-9_]+$')),
	CONSTRAINT "lead_vnext_reconciliation_issues_state_check" CHECK ("lead_vnext_reconciliation_issues"."state" in ('open','resolved','waived') and (("lead_vnext_reconciliation_issues"."state"='open' and "lead_vnext_reconciliation_issues"."resolution_code" is null and "lead_vnext_reconciliation_issues"."resolved_at" is null and "lead_vnext_reconciliation_issues"."resolved_by_membership_id" is null) or ("lead_vnext_reconciliation_issues"."state"='resolved' and "lead_vnext_reconciliation_issues"."resolution_code" in ('source_corrected','reconciled','superseded','not_applicable') and "lead_vnext_reconciliation_issues"."resolved_at" is not null and "lead_vnext_reconciliation_issues"."resolved_by_membership_id" is not null) or ("lead_vnext_reconciliation_issues"."state"='waived' and "lead_vnext_reconciliation_issues"."resolution_code"='operator_waiver' and "lead_vnext_reconciliation_issues"."resolved_at" is not null and "lead_vnext_reconciliation_issues"."resolved_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "lead_vnext_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contract_version" text DEFAULT 'lead-vnext-reconciliation.v1' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"source_cutoff_at" timestamp with time zone NOT NULL,
	"source_cutoff_id" uuid NOT NULL,
	"leads_scanned" bigint DEFAULT 0 NOT NULL,
	"leads_verified" bigint DEFAULT 0 NOT NULL,
	"leads_stale" bigint DEFAULT 0 NOT NULL,
	"leads_blocked" bigint DEFAULT 0 NOT NULL,
	"issues_opened" bigint DEFAULT 0 NOT NULL,
	"issues_resolved" bigint DEFAULT 0 NOT NULL,
	"operation_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_vnext_reconciliation_runs_contract_check" CHECK ("lead_vnext_reconciliation_runs"."contract_version"='lead-vnext-reconciliation.v1'),
	CONSTRAINT "lead_vnext_reconciliation_runs_state_check" CHECK ("lead_vnext_reconciliation_runs"."state" in ('pending','running','blocked','complete','abandoned') and (("lead_vnext_reconciliation_runs"."state"='pending' and "lead_vnext_reconciliation_runs"."started_at" is null and "lead_vnext_reconciliation_runs"."completed_at" is null) or ("lead_vnext_reconciliation_runs"."state" in ('running','blocked') and "lead_vnext_reconciliation_runs"."started_at" is not null and "lead_vnext_reconciliation_runs"."completed_at" is null) or ("lead_vnext_reconciliation_runs"."state"='complete' and "lead_vnext_reconciliation_runs"."started_at" is not null and "lead_vnext_reconciliation_runs"."completed_at" is not null) or ("lead_vnext_reconciliation_runs"."state"='abandoned' and "lead_vnext_reconciliation_runs"."completed_at" is not null))),
	CONSTRAINT "lead_vnext_reconciliation_runs_counts_check" CHECK ("lead_vnext_reconciliation_runs"."leads_scanned" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."leads_verified" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."leads_stale" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."leads_blocked" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."issues_opened" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."issues_resolved" between 0 and 9007199254740991 and "lead_vnext_reconciliation_runs"."leads_verified"+"lead_vnext_reconciliation_runs"."leads_stale"+"lead_vnext_reconciliation_runs"."leads_blocked"<="lead_vnext_reconciliation_runs"."leads_scanned" and "lead_vnext_reconciliation_runs"."issues_resolved"<="lead_vnext_reconciliation_runs"."issues_opened" and ("lead_vnext_reconciliation_runs"."state"<>'pending' or ("lead_vnext_reconciliation_runs"."leads_scanned"=0 and "lead_vnext_reconciliation_runs"."leads_verified"=0 and "lead_vnext_reconciliation_runs"."leads_stale"=0 and "lead_vnext_reconciliation_runs"."leads_blocked"=0 and "lead_vnext_reconciliation_runs"."issues_opened"=0 and "lead_vnext_reconciliation_runs"."issues_resolved"=0))),
	CONSTRAINT "lead_vnext_reconciliation_runs_version_check" CHECK ("lead_vnext_reconciliation_runs"."version">0)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "authority_contract_version" text DEFAULT 'p1a-lead-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "governing_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "created_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "updated_by_membership_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_vnext_reconciliation_runs_workspace_id_id_uq" ON "lead_vnext_reconciliation_runs" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "lead_authority_states" ADD CONSTRAINT "lead_authority_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_authority_states" ADD CONSTRAINT "lead_authority_states_cutover_run_fk" FOREIGN KEY ("workspace_id","cutover_run_id") REFERENCES "public"."lead_vnext_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_authority_states" ADD CONSTRAINT "lead_authority_states_switched_by_fk" FOREIGN KEY ("workspace_id","switched_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_mappings" ADD CONSTRAINT "lead_vnext_mappings_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_mappings" ADD CONSTRAINT "lead_vnext_mappings_run_fk" FOREIGN KEY ("workspace_id","reconciliation_run_id") REFERENCES "public"."lead_vnext_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_reconciliation_checkpoints" ADD CONSTRAINT "lead_vnext_reconciliation_checkpoints_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."lead_vnext_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_reconciliation_issues" ADD CONSTRAINT "lead_vnext_reconciliation_issues_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."lead_vnext_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_reconciliation_issues" ADD CONSTRAINT "lead_vnext_reconciliation_issues_resolver_fk" FOREIGN KEY ("workspace_id","resolved_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_reconciliation_runs" ADD CONSTRAINT "lead_vnext_reconciliation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vnext_reconciliation_runs" ADD CONSTRAINT "lead_vnext_reconciliation_runs_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_vnext_mappings_state_idx" ON "lead_vnext_mappings" USING btree ("workspace_id","state","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_vnext_reconciliation_issues_workspace_id_id_uq" ON "lead_vnext_reconciliation_issues" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_vnext_reconciliation_issues_identity_uq" ON "lead_vnext_reconciliation_issues" USING btree ("workspace_id","run_id","stream","source_record_type","source_record_id","issue_code");--> statement-breakpoint
CREATE INDEX "lead_vnext_reconciliation_issues_lookup_idx" ON "lead_vnext_reconciliation_issues" USING btree ("workspace_id","run_id","state","stream","source_record_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_vnext_reconciliation_runs_running_uq" ON "lead_vnext_reconciliation_runs" USING btree ("workspace_id") WHERE "lead_vnext_reconciliation_runs"."state"='running';--> statement-breakpoint
CREATE INDEX "lead_vnext_reconciliation_runs_state_idx" ON "lead_vnext_reconciliation_runs" USING btree ("workspace_id","state","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_created_by_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_updated_by_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_authority_contract_check" CHECK ("leads"."authority_contract_version" in ('p1a-lead-v1','lead-vnext-v1') and ("leads"."authority_contract_version"='p1a-lead-v1' or "leads"."governing_operation_id" is not null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_vnext_reconciliation_runs_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_counts bigint[];
  new_counts bigint[];
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'lead_vnext_reconciliation_run_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending' OR NEW.version<>1 OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.leads_scanned<>0 OR NEW.leads_verified<>0 OR NEW.leads_stale<>0 OR NEW.leads_blocked<>0
      OR NEW.issues_opened<>0 OR NEW.issues_resolved<>0 THEN
      RAISE EXCEPTION 'lead_vnext_reconciliation_run_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
    OR NEW.source_cutoff_at IS DISTINCT FROM OLD.source_cutoff_at OR NEW.source_cutoff_id IS DISTINCT FROM OLD.source_cutoff_id
    OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
    OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_run_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_run_version_invalid';
  END IF;
  old_counts:=ARRAY[OLD.leads_scanned,OLD.leads_verified,OLD.leads_stale,OLD.leads_blocked,OLD.issues_opened,OLD.issues_resolved];
  new_counts:=ARRAY[NEW.leads_scanned,NEW.leads_verified,NEW.leads_stale,NEW.leads_blocked,NEW.issues_opened,NEW.issues_resolved];
  IF EXISTS (SELECT 1 FROM generate_subscripts(old_counts,1) s WHERE new_counts[s]<old_counts[s]) THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_run_counts_decreased';
  END IF;
  IF OLD.state IN ('complete','abandoned') THEN RAISE EXCEPTION 'lead_vnext_reconciliation_run_terminal'; END IF;
  IF NEW.state<>OLD.state AND NOT ((OLD.state='pending' AND NEW.state IN ('running','abandoned'))
    OR (OLD.state='running' AND NEW.state IN ('blocked','complete','abandoned'))
    OR (OLD.state='blocked' AND NEW.state IN ('running','abandoned'))) THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_run_transition_invalid';
  END IF;
  IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_run_started_at_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_vnext_reconciliation_runs_enforce_v1
BEFORE INSERT OR UPDATE OR DELETE ON lead_vnext_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION lead_vnext_reconciliation_runs_enforce_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_authority_states_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'lead_authority_state_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.active_writer<>'p1a' OR NEW.migration_state<>'dormant' OR NEW.version<>1
      OR NEW.cutover_run_id IS NOT NULL OR NEW.switched_at IS NOT NULL OR NEW.switched_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'lead_authority_state_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lead_authority_state_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'lead_authority_state_version_invalid';
  END IF;
  IF OLD.active_writer='vnext' AND NEW.active_writer<>'vnext' THEN RAISE EXCEPTION 'lead_authority_state_writer_return_forbidden'; END IF;
  IF NOT ((OLD.active_writer='p1a' AND NEW.active_writer='p1a' AND OLD.migration_state='dormant' AND NEW.migration_state='shadow')
    OR (OLD.active_writer='p1a' AND NEW.active_writer='p1a' AND OLD.migration_state='shadow' AND NEW.migration_state IN ('dormant','reconciling'))
    OR (OLD.active_writer='p1a' AND NEW.active_writer='p1a' AND OLD.migration_state='reconciling' AND NEW.migration_state IN ('shadow','ready'))
    OR (OLD.active_writer='p1a' AND OLD.migration_state='ready' AND NEW.active_writer='p1a' AND NEW.migration_state='reconciling')
    OR (OLD.active_writer='p1a' AND OLD.migration_state='ready' AND NEW.active_writer='vnext' AND NEW.migration_state='observing')
    OR (OLD.active_writer='vnext' AND OLD.migration_state='observing' AND NEW.active_writer='vnext' AND NEW.migration_state='retirement_ready')) THEN
    RAISE EXCEPTION 'lead_authority_state_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_authority_states_enforce_v1
BEFORE INSERT OR UPDATE OR DELETE ON lead_authority_states
FOR EACH ROW EXECUTE FUNCTION lead_authority_states_enforce_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_vnext_mappings_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'lead_vnext_mapping_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN RAISE EXCEPTION 'lead_vnext_mapping_initial_version_invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.source_contract_version IS DISTINCT FROM OLD.source_contract_version
    OR NEW.target_contract_version IS DISTINCT FROM OLD.target_contract_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lead_vnext_mapping_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'lead_vnext_mapping_version_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_vnext_mappings_enforce_v1
BEFORE INSERT OR UPDATE OR DELETE ON lead_vnext_mappings
FOR EACH ROW EXECUTE FUNCTION lead_vnext_mappings_enforce_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_vnext_reconciliation_checkpoints_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'lead_vnext_reconciliation_checkpoint_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN RAISE EXCEPTION 'lead_vnext_reconciliation_checkpoint_initial_version_invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.stream IS DISTINCT FROM OLD.stream THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_checkpoint_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.processed_count<OLD.processed_count OR NEW.issue_count<OLD.issue_count THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_checkpoint_version_invalid';
  END IF;
  IF OLD.last_sort_at IS NOT NULL AND (NEW.last_sort_at IS NULL OR (NEW.last_sort_at,NEW.last_id)<(OLD.last_sort_at,OLD.last_id)) THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_checkpoint_cursor_decreased';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_vnext_reconciliation_checkpoints_enforce_v1
BEFORE INSERT OR UPDATE OR DELETE ON lead_vnext_reconciliation_checkpoints
FOR EACH ROW EXECUTE FUNCTION lead_vnext_reconciliation_checkpoints_enforce_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_vnext_reconciliation_issues_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'lead_vnext_reconciliation_issue_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'open' OR NEW.version<>1 THEN RAISE EXCEPTION 'lead_vnext_reconciliation_issue_initial_state_invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.stream IS DISTINCT FROM OLD.stream
    OR NEW.source_record_type IS DISTINCT FROM OLD.source_record_type OR NEW.source_record_id IS DISTINCT FROM OLD.source_record_id
    OR NEW.issue_code IS DISTINCT FROM OLD.issue_code OR NEW.expected_version IS DISTINCT FROM OLD.expected_version
    OR NEW.observed_version IS DISTINCT FROM OLD.observed_version OR NEW.related_record_id IS DISTINCT FROM OLD.related_record_id
    OR NEW.safe_code IS DISTINCT FROM OLD.safe_code OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_issue_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_issue_version_invalid';
  END IF;
  IF OLD.state<>'open' OR NEW.state NOT IN ('resolved','waived') THEN
    RAISE EXCEPTION 'lead_vnext_reconciliation_issue_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_vnext_reconciliation_issues_enforce_v1
BEFORE INSERT OR UPDATE OR DELETE ON lead_vnext_reconciliation_issues
FOR EACH ROW EXECUTE FUNCTION lead_vnext_reconciliation_issues_enforce_v1();
