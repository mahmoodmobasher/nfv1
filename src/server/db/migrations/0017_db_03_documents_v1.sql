CREATE TABLE "document_record_references" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"relationship_role" text DEFAULT 'related' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_record_references_pk" PRIMARY KEY("workspace_id","document_id","record_type","record_id"),
	CONSTRAINT "document_record_references_type_check" CHECK ("document_record_references"."record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')),
	CONSTRAINT "document_record_references_role_check" CHECK ("document_record_references"."relationship_role"='related')
);
--> statement-breakpoint
CREATE TABLE "document_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"availability" text DEFAULT 'awaiting_upload' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_content_version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"redaction_requested_at" timestamp with time zone,
	"redaction_requested_by_membership_id" uuid,
	"redacted_at" timestamp with time zone,
	"redacted_by_membership_id" uuid,
	"purge_requested_at" timestamp with time zone,
	"purge_requested_by_membership_id" uuid,
	"purged_at" timestamp with time zone,
	"purged_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_records_lifecycle_check" CHECK ("document_records"."lifecycle" in ('active','archived','redaction_pending','redacted','purge_pending','purged')),
	CONSTRAINT "document_records_availability_check" CHECK ("document_records"."availability" in ('awaiting_upload','quarantined','available','blocked','failed','unavailable')),
	CONSTRAINT "document_records_version_check" CHECK ("document_records"."version">0 and "document_records"."current_content_version" between 1 and 100),
	CONSTRAINT "document_records_metadata_pairs_check" CHECK (num_nonnulls("document_records"."archived_at","document_records"."archived_by_membership_id")<>1 and num_nonnulls("document_records"."redaction_requested_at","document_records"."redaction_requested_by_membership_id")<>1 and num_nonnulls("document_records"."redacted_at","document_records"."redacted_by_membership_id")<>1 and num_nonnulls("document_records"."purge_requested_at","document_records"."purge_requested_by_membership_id")<>1 and num_nonnulls("document_records"."purged_at","document_records"."purged_by_membership_id")<>1),
	CONSTRAINT "document_records_lifecycle_metadata_check" CHECK (
      ("document_records"."lifecycle"='active' and num_nonnulls("document_records"."archived_at","document_records"."archived_by_membership_id","document_records"."redaction_requested_at","document_records"."redaction_requested_by_membership_id","document_records"."redacted_at","document_records"."redacted_by_membership_id","document_records"."purge_requested_at","document_records"."purge_requested_by_membership_id","document_records"."purged_at","document_records"."purged_by_membership_id")=0) or
      ("document_records"."lifecycle"='archived' and "document_records"."archived_at" is not null and "document_records"."redaction_requested_at" is null and "document_records"."redacted_at" is null and "document_records"."purge_requested_at" is null and "document_records"."purged_at" is null) or
      ("document_records"."lifecycle"='redaction_pending' and "document_records"."redaction_requested_at" is not null and "document_records"."redacted_at" is null and "document_records"."purge_requested_at" is null and "document_records"."purged_at" is null) or
      ("document_records"."lifecycle"='redacted' and "document_records"."redaction_requested_at" is not null and "document_records"."redacted_at" is not null and "document_records"."purge_requested_at" is null and "document_records"."purged_at" is null) or
      ("document_records"."lifecycle"='purge_pending' and "document_records"."purge_requested_at" is not null and "document_records"."purged_at" is null and ("document_records"."archived_at" is not null or ("document_records"."redaction_requested_at" is not null and "document_records"."redacted_at" is not null))) or
      ("document_records"."lifecycle"='purged' and "document_records"."purge_requested_at" is not null and "document_records"."purged_at" is not null and ("document_records"."archived_at" is not null or ("document_records"."redaction_requested_at" is not null and "document_records"."redacted_at" is not null)))),
	CONSTRAINT "document_records_terminal_availability_check" CHECK ("document_records"."lifecycle" not in ('redaction_pending','redacted','purge_pending','purged') or "document_records"."availability"='unavailable')
);
--> statement-breakpoint
CREATE TABLE "document_scan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"storage_object_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" text NOT NULL,
	"engine_code" text NOT NULL,
	"engine_version" text NOT NULL,
	"signature_set_version" text NOT NULL,
	"scanned_sha256_hex" char(64) NOT NULL,
	"safe_result_code" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_scan_results_attempt_check" CHECK ("document_scan_results"."attempt_number" between 1 and 3),
	CONSTRAINT "document_scan_results_outcome_check" CHECK ("document_scan_results"."outcome" in ('clean','infected','error','timeout')),
	CONSTRAINT "document_scan_results_codes_check" CHECK (char_length(btrim("document_scan_results"."engine_code")) between 1 and 128 and "document_scan_results"."engine_code" !~ '[[:cntrl:]]' and char_length(btrim("document_scan_results"."engine_version")) between 1 and 128 and "document_scan_results"."engine_version" !~ '[[:cntrl:]]' and char_length(btrim("document_scan_results"."signature_set_version")) between 1 and 128 and "document_scan_results"."signature_set_version" !~ '[[:cntrl:]]' and char_length(btrim("document_scan_results"."safe_result_code")) between 1 and 128 and "document_scan_results"."safe_result_code" !~ '[[:cntrl:]]'),
	CONSTRAINT "document_scan_results_hash_check" CHECK ("document_scan_results"."scanned_sha256_hex" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_scan_results_time_check" CHECK ("document_scan_results"."completed_at">="document_scan_results"."started_at")
);
--> statement-breakpoint
CREATE TABLE "document_storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content_version" integer NOT NULL,
	"storage_adapter_code" text NOT NULL,
	"residency_region_code" text NOT NULL,
	"residency_policy_version" text NOT NULL,
	"container_handle" text NOT NULL,
	"object_key" text NOT NULL,
	"provider_object_version" text,
	"etag" text,
	"encryption_mode" text NOT NULL,
	"encryption_key_handle" text,
	"state" text DEFAULT 'reserved' NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"upload_verified_at" timestamp with time zone,
	"delete_requested_at" timestamp with time zone,
	"delete_verified_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_storage_objects_adapter_check" CHECK ("document_storage_objects"."storage_adapter_code" ~ '^[a-z][a-z0-9_.-]{1,63}$' and "document_storage_objects"."residency_region_code" ~ '^[a-z][a-z0-9_.-]{1,63}$'),
	CONSTRAINT "document_storage_objects_policy_check" CHECK (char_length(btrim("document_storage_objects"."residency_policy_version")) between 1 and 64),
	CONSTRAINT "document_storage_objects_container_check" CHECK (char_length(btrim("document_storage_objects"."container_handle")) between 1 and 200 and "document_storage_objects"."container_handle" !~ '[[:cntrl:]]'),
	CONSTRAINT "document_storage_objects_key_check" CHECK (char_length(btrim("document_storage_objects"."object_key")) between 1 and 512 and "document_storage_objects"."object_key" !~ '[[:cntrl:]]' and "document_storage_objects"."object_key" !~ '^/' and "document_storage_objects"."object_key" !~ '(^|/)\.{1,2}(/|$)'),
	CONSTRAINT "document_storage_objects_provider_facts_check" CHECK (("document_storage_objects"."provider_object_version" is null or (char_length(btrim("document_storage_objects"."provider_object_version")) between 1 and 256 and "document_storage_objects"."provider_object_version" !~ '[[:cntrl:]]')) and ("document_storage_objects"."etag" is null or (char_length(btrim("document_storage_objects"."etag")) between 1 and 256 and "document_storage_objects"."etag" !~ '[[:cntrl:]]'))),
	CONSTRAINT "document_storage_objects_encryption_check" CHECK ("document_storage_objects"."encryption_mode" in ('provider_managed','customer_managed_envelope') and (("document_storage_objects"."state"<>'purged' and "document_storage_objects"."encryption_mode"='provider_managed' and "document_storage_objects"."encryption_key_handle" is null) or ("document_storage_objects"."state"<>'purged' and "document_storage_objects"."encryption_mode"='customer_managed_envelope' and char_length(btrim("document_storage_objects"."encryption_key_handle")) between 1 and 256 and "document_storage_objects"."encryption_key_handle" !~ '[[:cntrl:]]') or ("document_storage_objects"."state"='purged' and "document_storage_objects"."encryption_key_handle" is null))),
	CONSTRAINT "document_storage_objects_state_check" CHECK ("document_storage_objects"."state" in ('reserved','uploaded','quarantined','scanning','clean','blocked','failed','delete_pending','purged')),
	CONSTRAINT "document_storage_objects_attempt_check" CHECK ("document_storage_objects"."attempt_count" between 0 and 3),
	CONSTRAINT "document_storage_objects_state_metadata_check" CHECK (
      ("document_storage_objects"."state"='reserved' and "document_storage_objects"."upload_verified_at" is null and "document_storage_objects"."delete_requested_at" is null and "document_storage_objects"."delete_verified_at" is null) or
      ("document_storage_objects"."state" in ('uploaded','quarantined','scanning','clean','blocked','failed') and "document_storage_objects"."upload_verified_at" is not null and "document_storage_objects"."delete_requested_at" is null and "document_storage_objects"."delete_verified_at" is null) or
      ("document_storage_objects"."state"='delete_pending' and "document_storage_objects"."delete_requested_at" is not null and "document_storage_objects"."delete_verified_at" is null) or
      ("document_storage_objects"."state"='purged' and "document_storage_objects"."delete_requested_at" is not null and "document_storage_objects"."delete_verified_at" is not null and "document_storage_objects"."provider_object_version" is null and "document_storage_objects"."etag" is null)),
	CONSTRAINT "document_storage_objects_retry_check" CHECK ("document_storage_objects"."next_attempt_at" is null or "document_storage_objects"."state" in ('quarantined','scanning','failed'))
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content_version" integer NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"display_filename" text,
	"declared_mime_type" text,
	"detected_mime_type" text,
	"byte_size" bigint,
	"sha256_hex" char(64),
	"redaction_marker" text,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone,
	"redacted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "document_versions_content_version_check" CHECK ("document_versions"."content_version" between 1 and 100),
	CONSTRAINT "document_versions_state_check" CHECK ("document_versions"."state" in ('reserved','uploaded','quarantined','available','blocked','failed','redacted','purged')),
	CONSTRAINT "document_versions_filename_check" CHECK ("document_versions"."display_filename" is null or (char_length(btrim("document_versions"."display_filename")) between 1 and 255 and "document_versions"."display_filename" !~ '[[:cntrl:]/\\]')),
	CONSTRAINT "document_versions_declared_mime_check" CHECK ("document_versions"."declared_mime_type" is null or "document_versions"."declared_mime_type" in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
	CONSTRAINT "document_versions_detected_mime_check" CHECK ("document_versions"."detected_mime_type" is null or "document_versions"."detected_mime_type" in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
	CONSTRAINT "document_versions_size_check" CHECK ("document_versions"."byte_size" is null or "document_versions"."byte_size" between 1 and 26214400),
	CONSTRAINT "document_versions_hash_check" CHECK ("document_versions"."sha256_hex" is null or "document_versions"."sha256_hex" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_versions_state_metadata_check" CHECK (
      ("document_versions"."state"='reserved' and "document_versions"."display_filename" is not null and "document_versions"."declared_mime_type" is not null and "document_versions"."detected_mime_type" is null and "document_versions"."byte_size" is null and "document_versions"."sha256_hex" is null and "document_versions"."available_at" is null and "document_versions"."redacted_at" is null and "document_versions"."purged_at" is null and "document_versions"."redaction_marker" is null) or
      ("document_versions"."state" in ('uploaded','quarantined') and "document_versions"."display_filename" is not null and "document_versions"."declared_mime_type" is not null and "document_versions"."detected_mime_type" is not null and "document_versions"."byte_size" is not null and "document_versions"."sha256_hex" is not null and "document_versions"."available_at" is null and "document_versions"."redacted_at" is null and "document_versions"."purged_at" is null and "document_versions"."redaction_marker" is null) or
      ("document_versions"."state"='available' and "document_versions"."display_filename" is not null and "document_versions"."declared_mime_type" is not null and "document_versions"."detected_mime_type" is not null and "document_versions"."byte_size" is not null and "document_versions"."sha256_hex" is not null and "document_versions"."available_at" is not null and "document_versions"."redacted_at" is null and "document_versions"."purged_at" is null and "document_versions"."redaction_marker" is null) or
      ("document_versions"."state" in ('blocked','failed') and "document_versions"."display_filename" is not null and "document_versions"."declared_mime_type" is not null and "document_versions"."detected_mime_type" is not null and "document_versions"."byte_size" is not null and "document_versions"."sha256_hex" is not null and "document_versions"."redacted_at" is null and "document_versions"."purged_at" is null and "document_versions"."redaction_marker" is null) or
      ("document_versions"."state"='redacted' and "document_versions"."display_filename" is null and "document_versions"."declared_mime_type" is null and "document_versions"."detected_mime_type" is null and "document_versions"."byte_size" is null and "document_versions"."sha256_hex" is null and "document_versions"."redaction_marker"='content_redacted' and "document_versions"."redacted_at" is not null and "document_versions"."purged_at" is null) or
      ("document_versions"."state"='purged' and "document_versions"."display_filename" is null and "document_versions"."declared_mime_type" is null and "document_versions"."detected_mime_type" is null and "document_versions"."byte_size" is null and "document_versions"."sha256_hex" is null and "document_versions"."redaction_marker"='content_redacted' and "document_versions"."purged_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "retention_legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"record_type" text DEFAULT 'crm.document' NOT NULL,
	"record_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason_code" text NOT NULL,
	"case_reference" text,
	"policy_version" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placed_by_membership_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_legal_holds_record_type_check" CHECK ("retention_legal_holds"."record_type"='crm.document'),
	CONSTRAINT "retention_legal_holds_status_check" CHECK ("retention_legal_holds"."status" in ('active','released')),
	CONSTRAINT "retention_legal_holds_reason_check" CHECK ("retention_legal_holds"."reason_code" in ('legal_dispute','regulatory','investigation','customer_request','other')),
	CONSTRAINT "retention_legal_holds_case_check" CHECK ("retention_legal_holds"."case_reference" is null or (char_length(btrim("retention_legal_holds"."case_reference")) between 1 and 200 and "retention_legal_holds"."case_reference" !~ '[[:cntrl:]]')),
	CONSTRAINT "retention_legal_holds_policy_check" CHECK (char_length(btrim("retention_legal_holds"."policy_version")) between 1 and 64),
	CONSTRAINT "retention_legal_holds_version_check" CHECK ("retention_legal_holds"."version">0),
	CONSTRAINT "retention_legal_holds_release_check" CHECK (("retention_legal_holds"."status"='active' and "retention_legal_holds"."released_at" is null and "retention_legal_holds"."released_by_membership_id" is null) or ("retention_legal_holds"."status"='released' and "retention_legal_holds"."released_at" is not null and "retention_legal_holds"."released_by_membership_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "document_records_workspace_id_id_uq" ON "document_records" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_objects_workspace_id_id_uq" ON "document_storage_objects" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_workspace_id_id_uq" ON "document_versions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_workspace_document_content_uq" ON "document_versions" USING btree ("workspace_id","document_id","content_version");--> statement-breakpoint
ALTER TABLE "document_record_references" ADD CONSTRAINT "document_record_references_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."document_records"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_record_references" ADD CONSTRAINT "document_record_references_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_redaction_requester_fk" FOREIGN KEY ("workspace_id","redaction_requested_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_redactor_fk" FOREIGN KEY ("workspace_id","redacted_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_purge_requester_fk" FOREIGN KEY ("workspace_id","purge_requested_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_workspace_purger_fk" FOREIGN KEY ("workspace_id","purged_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_scan_results" ADD CONSTRAINT "document_scan_results_object_fk" FOREIGN KEY ("workspace_id","storage_object_id") REFERENCES "public"."document_storage_objects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_storage_objects" ADD CONSTRAINT "document_storage_objects_version_fk" FOREIGN KEY ("workspace_id","document_id","content_version") REFERENCES "public"."document_versions"("workspace_id","document_id","content_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."document_records"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_legal_holds" ADD CONSTRAINT "retention_legal_holds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_legal_holds" ADD CONSTRAINT "retention_legal_holds_workspace_placer_fk" FOREIGN KEY ("workspace_id","placed_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_legal_holds" ADD CONSTRAINT "retention_legal_holds_workspace_releaser_fk" FOREIGN KEY ("workspace_id","released_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_record_references_target_idx" ON "document_record_references" USING btree ("workspace_id","record_type","record_id","document_id");--> statement-breakpoint
CREATE INDEX "document_records_workspace_lifecycle_updated_idx" ON "document_records" USING btree ("workspace_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "document_records_workspace_creator_lifecycle_updated_idx" ON "document_records" USING btree ("workspace_id","created_by_membership_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "document_scan_results_workspace_id_id_uq" ON "document_scan_results" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_scan_results_workspace_object_attempt_uq" ON "document_scan_results" USING btree ("workspace_id","storage_object_id","attempt_number");--> statement-breakpoint
CREATE INDEX "document_scan_results_workspace_object_attempt_idx" ON "document_scan_results" USING btree ("workspace_id","storage_object_id","attempt_number" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_objects_workspace_document_content_uq" ON "document_storage_objects" USING btree ("workspace_id","document_id","content_version");--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_objects_locator_uq" ON "document_storage_objects" USING btree ("storage_adapter_code","residency_region_code","container_handle","object_key");--> statement-breakpoint
CREATE INDEX "document_storage_objects_worker_idx" ON "document_storage_objects" USING btree ("state","next_attempt_at","id");--> statement-breakpoint
CREATE INDEX "document_storage_objects_workspace_state_updated_idx" ON "document_storage_objects" USING btree ("workspace_id","state","updated_at","id");--> statement-breakpoint
CREATE INDEX "document_versions_workspace_document_content_idx" ON "document_versions" USING btree ("workspace_id","document_id","content_version" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "retention_legal_holds_workspace_id_id_uq" ON "retention_legal_holds" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_legal_holds_active_record_uq" ON "retention_legal_holds" USING btree ("workspace_id","record_type","record_id") WHERE "retention_legal_holds"."status"='active';--> statement-breakpoint
CREATE INDEX "retention_legal_holds_record_idx" ON "retention_legal_holds" USING btree ("workspace_id","record_type","record_id","status","id");--> statement-breakpoint
CREATE INDEX "retention_legal_holds_workspace_status_updated_idx" ON "retention_legal_holds" USING btree ("workspace_id","status","updated_at","id");--> statement-breakpoint
CREATE FUNCTION document_records_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'document_records_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.availability<>'awaiting_upload' OR NEW.version<>1 OR NEW.current_content_version<>1 OR
       num_nonnulls(NEW.archived_at,NEW.archived_by_membership_id,NEW.redaction_requested_at,NEW.redaction_requested_by_membership_id,
         NEW.redacted_at,NEW.redacted_by_membership_id,NEW.purge_requested_at,NEW.purge_requested_by_membership_id,
         NEW.purged_at,NEW.purged_by_membership_id)<>0 THEN
      RAISE EXCEPTION 'document_record_invalid_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.lifecycle='purged' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'document_record_purged_terminal'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'document_record_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'document_record_version_operation_invalid';
  END IF;
  IF NEW.current_content_version<>OLD.current_content_version AND NEW.current_content_version<>OLD.current_content_version+1 THEN
    RAISE EXCEPTION 'document_record_content_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived','redaction_pending')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle IN ('archived','active','redaction_pending','purge_pending')) OR
          (OLD.lifecycle='redaction_pending' AND NEW.lifecycle IN ('redaction_pending','redacted')) OR
          (OLD.lifecycle='redacted' AND NEW.lifecycle IN ('redacted','purge_pending')) OR
          (OLD.lifecycle='purge_pending' AND NEW.lifecycle IN ('purge_pending','purged'))) THEN
    RAISE EXCEPTION 'document_record_lifecycle_transition_invalid';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER document_records_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON document_records
FOR EACH ROW EXECUTE FUNCTION document_records_enforce_v1();--> statement-breakpoint
CREATE FUNCTION document_records_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_state text; object_state text; bad_count bigint;
BEGIN
  SELECT state INTO current_state FROM document_versions
   WHERE workspace_id=NEW.workspace_id AND document_id=NEW.id AND content_version=NEW.current_content_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_current_version_required'; END IF;
  SELECT state INTO object_state FROM document_storage_objects
   WHERE workspace_id=NEW.workspace_id AND document_id=NEW.id AND content_version=NEW.current_content_version;
  IF NEW.availability='available' AND (current_state<>'available' OR object_state IS DISTINCT FROM 'clean') THEN
    RAISE EXCEPTION 'document_downloadable_pairing_invalid';
  END IF;
  IF NEW.lifecycle='redacted' THEN
    SELECT count(*) INTO bad_count FROM document_versions v LEFT JOIN document_storage_objects o
      ON o.workspace_id=v.workspace_id AND o.document_id=v.document_id AND o.content_version=v.content_version
      WHERE v.workspace_id=NEW.workspace_id AND v.document_id=NEW.id AND (v.state<>'redacted' OR o.state IS DISTINCT FROM 'purged');
    IF bad_count<>0 THEN RAISE EXCEPTION 'document_redaction_pairing_invalid'; END IF;
  ELSIF NEW.lifecycle='purged' THEN
    SELECT count(*) INTO bad_count FROM document_versions v LEFT JOIN document_storage_objects o
      ON o.workspace_id=v.workspace_id AND o.document_id=v.document_id AND o.content_version=v.content_version
      WHERE v.workspace_id=NEW.workspace_id AND v.document_id=NEW.id AND (v.state<>'purged' OR o.state IS DISTINCT FROM 'purged');
    IF bad_count<>0 THEN RAISE EXCEPTION 'document_purge_pairing_invalid'; END IF;
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER document_records_pairing_v1 AFTER INSERT OR UPDATE ON document_records
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_records_pairing_v1();--> statement-breakpoint
CREATE FUNCTION document_versions_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'document_versions_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'reserved' THEN RAISE EXCEPTION 'document_version_must_start_reserved'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.document_id<>OLD.document_id OR
     NEW.content_version<>OLD.content_version OR NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'document_version_identity_immutable';
  END IF;
  IF NEW.governing_operation_id=OLD.governing_operation_id THEN RAISE EXCEPTION 'document_version_operation_must_advance'; END IF;
  IF NOT ((OLD.state='reserved' AND NEW.state IN ('uploaded','blocked','failed','purged')) OR
          (OLD.state='uploaded' AND NEW.state IN ('quarantined','blocked','failed','purged')) OR
          (OLD.state='quarantined' AND NEW.state IN ('available','blocked','failed','purged')) OR
          (OLD.state='available' AND NEW.state IN ('redacted','purged')) OR
          (OLD.state IN ('blocked','failed') AND NEW.state IN ('quarantined','redacted','purged')) OR
          (OLD.state='redacted' AND NEW.state='purged')) THEN
    RAISE EXCEPTION 'document_version_state_transition_invalid';
  END IF;
  IF OLD.state<>'reserved' AND NEW.state NOT IN ('redacted','purged') AND
     (NEW.display_filename IS DISTINCT FROM OLD.display_filename OR NEW.declared_mime_type IS DISTINCT FROM OLD.declared_mime_type OR
      NEW.detected_mime_type IS DISTINCT FROM OLD.detected_mime_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR
      NEW.sha256_hex IS DISTINCT FROM OLD.sha256_hex) THEN
    RAISE EXCEPTION 'document_version_content_immutable';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER document_versions_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION document_versions_enforce_v1();--> statement-breakpoint
CREATE FUNCTION document_versions_scrub_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_lifecycle text; root_operation uuid;
BEGIN
  IF NEW.state NOT IN ('redacted','purged') OR NEW.state=OLD.state THEN RETURN NULL; END IF;
  SELECT lifecycle,governing_operation_id INTO root_lifecycle,root_operation FROM document_records
   WHERE workspace_id=NEW.workspace_id AND id=NEW.document_id;
  IF root_operation<>NEW.governing_operation_id OR
     (NEW.state='redacted' AND root_lifecycle NOT IN ('redaction_pending','redacted')) OR
     (NEW.state='purged' AND root_lifecycle NOT IN ('purge_pending','purged')) THEN
    RAISE EXCEPTION 'document_version_scrub_pairing_invalid';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER document_versions_scrub_pairing_v1 AFTER UPDATE ON document_versions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_versions_scrub_pairing_v1();--> statement-breakpoint
CREATE FUNCTION document_storage_objects_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'document_storage_objects_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'reserved' OR NEW.attempt_count<>0 OR NEW.provider_object_version IS NOT NULL OR NEW.etag IS NOT NULL THEN
      RAISE EXCEPTION 'document_storage_object_invalid_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state='purged' THEN RAISE EXCEPTION 'document_storage_object_purged_terminal'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.document_id<>OLD.document_id OR NEW.content_version<>OLD.content_version OR
     NEW.storage_adapter_code<>OLD.storage_adapter_code OR NEW.residency_region_code<>OLD.residency_region_code OR
     NEW.residency_policy_version<>OLD.residency_policy_version OR NEW.container_handle<>OLD.container_handle OR
     NEW.object_key<>OLD.object_key OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'document_storage_object_identity_immutable';
  END IF;
  IF NEW.governing_operation_id=OLD.governing_operation_id THEN RAISE EXCEPTION 'document_storage_object_operation_must_advance'; END IF;
  IF NOT ((OLD.state='reserved' AND NEW.state IN ('uploaded','blocked','failed','delete_pending')) OR
          (OLD.state='uploaded' AND NEW.state IN ('quarantined','blocked','failed','delete_pending')) OR
          (OLD.state='quarantined' AND NEW.state IN ('scanning','blocked','failed','delete_pending')) OR
          (OLD.state='scanning' AND NEW.state IN ('clean','blocked','failed','quarantined','delete_pending')) OR
          (OLD.state='clean' AND NEW.state='delete_pending') OR
          (OLD.state IN ('blocked','failed') AND NEW.state IN ('quarantined','delete_pending')) OR
          (OLD.state='delete_pending' AND NEW.state IN ('delete_pending','purged'))) THEN
    RAISE EXCEPTION 'document_storage_object_state_transition_invalid';
  END IF;
  IF NEW.attempt_count<OLD.attempt_count OR NEW.attempt_count>OLD.attempt_count+1 THEN
    RAISE EXCEPTION 'document_storage_object_attempt_invalid';
  END IF;
  IF (OLD.provider_object_version IS NULL AND NEW.provider_object_version IS NOT NULL OR OLD.etag IS NULL AND NEW.etag IS NOT NULL) AND
     NOT (OLD.state='reserved' AND NEW.state='uploaded' AND NEW.upload_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'document_storage_provider_facts_invalid';
  END IF;
  IF OLD.provider_object_version IS NOT NULL AND NEW.state<>'purged' AND NEW.provider_object_version IS DISTINCT FROM OLD.provider_object_version THEN
    RAISE EXCEPTION 'document_storage_provider_version_immutable';
  END IF;
  IF OLD.etag IS NOT NULL AND NEW.state<>'purged' AND NEW.etag IS DISTINCT FROM OLD.etag THEN
    RAISE EXCEPTION 'document_storage_etag_immutable';
  END IF;
  IF OLD.encryption_key_handle IS NOT NULL AND NEW.state<>'purged' AND NEW.encryption_key_handle IS DISTINCT FROM OLD.encryption_key_handle THEN
    RAISE EXCEPTION 'document_storage_key_handle_immutable';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER document_storage_objects_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON document_storage_objects
FOR EACH ROW EXECUTE FUNCTION document_storage_objects_enforce_v1();--> statement-breakpoint
CREATE FUNCTION document_storage_objects_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state text; root_state text; root_availability text; root_current integer; root_operation uuid;
BEGIN
  SELECT v.state,d.lifecycle,d.availability,d.current_content_version,d.governing_operation_id
    INTO version_state,root_state,root_availability,root_current,root_operation
    FROM document_versions v JOIN document_records d ON d.workspace_id=v.workspace_id AND d.id=v.document_id
    WHERE v.workspace_id=NEW.workspace_id AND v.document_id=NEW.document_id AND v.content_version=NEW.content_version;
  IF NEW.state='clean' AND (version_state<>'available' OR
     (root_current=NEW.content_version AND (root_state<>'active' OR root_availability<>'available'))) THEN
    RAISE EXCEPTION 'document_storage_clean_pairing_invalid';
  END IF;
  IF NEW.state='purged' AND (version_state NOT IN ('redacted','purged') OR
     root_state NOT IN ('redaction_pending','redacted','purge_pending','purged') OR NEW.governing_operation_id<>root_operation) THEN
    RAISE EXCEPTION 'document_storage_purge_pairing_invalid';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER document_storage_objects_pairing_v1 AFTER INSERT OR UPDATE ON document_storage_objects
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_storage_objects_pairing_v1();--> statement-breakpoint
CREATE FUNCTION document_scan_results_append_only_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'document_scan_results_append_only'; END $$;--> statement-breakpoint
CREATE TRIGGER document_scan_results_append_only_v1 BEFORE UPDATE OR DELETE ON document_scan_results
FOR EACH ROW EXECUTE FUNCTION document_scan_results_append_only_v1();--> statement-breakpoint
CREATE FUNCTION document_scan_results_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE object_attempt integer; object_operation uuid; version_hash character(64);
BEGIN
  SELECT o.attempt_count,o.governing_operation_id,v.sha256_hex INTO object_attempt,object_operation,version_hash
    FROM document_storage_objects o JOIN document_versions v ON v.workspace_id=o.workspace_id AND v.document_id=o.document_id AND v.content_version=o.content_version
    WHERE o.workspace_id=NEW.workspace_id AND o.id=NEW.storage_object_id;
  IF NOT FOUND OR NEW.attempt_number>object_attempt OR NEW.scanned_sha256_hex<>version_hash OR NEW.governing_operation_id<>object_operation THEN
    RAISE EXCEPTION 'document_scan_result_pairing_invalid';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER document_scan_results_pairing_v1 AFTER INSERT ON document_scan_results
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_scan_results_pairing_v1();--> statement-breakpoint
CREATE FUNCTION retention_legal_holds_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retention_legal_holds_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.version<>1 OR NEW.released_at IS NOT NULL OR NEW.released_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'retention_legal_hold_invalid_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.record_type<>OLD.record_type OR NEW.record_id<>OLD.record_id OR
     NEW.reason_code<>OLD.reason_code OR NEW.case_reference IS DISTINCT FROM OLD.case_reference OR NEW.policy_version<>OLD.policy_version OR
     NEW.placed_at<>OLD.placed_at OR NEW.placed_by_membership_id<>OLD.placed_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'retention_legal_hold_identity_immutable';
  END IF;
  IF OLD.status<>'active' OR NEW.status<>'released' OR NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id THEN
    RAISE EXCEPTION 'retention_legal_hold_release_invalid';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER retention_legal_holds_enforce_v1 BEFORE UPDATE OR DELETE ON retention_legal_holds
FOR EACH ROW EXECUTE FUNCTION retention_legal_holds_enforce_v1();
