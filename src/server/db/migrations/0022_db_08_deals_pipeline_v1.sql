CREATE TABLE "deal_party_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"role_code" text NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"contact_slot" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_party_refs_shape_check" CHECK (("deal_party_refs"."role_code"='customer_company' and "deal_party_refs"."record_type"='crm.company' and "deal_party_refs"."contact_slot" is null and not "deal_party_refs"."is_primary") or ("deal_party_refs"."role_code"='buying_contact' and "deal_party_refs"."record_type"='crm.contact' and "deal_party_refs"."contact_slot" between 1 and 20)),
	CONSTRAINT "deal_party_refs_lifecycle_check" CHECK ("deal_party_refs"."lifecycle" in ('active','ended') and "deal_party_refs"."version">0 and (("deal_party_refs"."lifecycle"='active' and "deal_party_refs"."ended_at" is null and "deal_party_refs"."ended_by_membership_id" is null) or ("deal_party_refs"."lifecycle"='ended' and "deal_party_refs"."ended_at" is not null and "deal_party_refs"."ended_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "deal_stage_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"outcome_class" text NOT NULL,
	"sort_key" bigint NOT NULL,
	"default_probability_bps" integer NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_stage_definitions_code_check" CHECK ("deal_stage_definitions"."code" ~ '^sales\.[a-z][a-z0-9_]{1,55}$'),
	CONSTRAINT "deal_stage_definitions_label_check" CHECK ("deal_stage_definitions"."label"=btrim("deal_stage_definitions"."label") and char_length("deal_stage_definitions"."label") between 1 and 100 and "deal_stage_definitions"."label" !~ '[[:cntrl:]]'),
	CONSTRAINT "deal_stage_definitions_outcome_check" CHECK ("deal_stage_definitions"."outcome_class" in ('open','won','lost')),
	CONSTRAINT "deal_stage_definitions_sort_check" CHECK ("deal_stage_definitions"."sort_key" between 0 and 9007199254740991),
	CONSTRAINT "deal_stage_definitions_probability_check" CHECK ("deal_stage_definitions"."default_probability_bps" between 0 and 10000 and ("deal_stage_definitions"."outcome_class"<>'won' or "deal_stage_definitions"."default_probability_bps"=10000) and ("deal_stage_definitions"."outcome_class"<>'lost' or "deal_stage_definitions"."default_probability_bps"=0)),
	CONSTRAINT "deal_stage_definitions_lifecycle_check" CHECK ("deal_stage_definitions"."lifecycle" in ('active','archived')),
	CONSTRAINT "deal_stage_definitions_version_check" CHECK ("deal_stage_definitions"."version">0),
	CONSTRAINT "deal_stage_definitions_archive_check" CHECK (("deal_stage_definitions"."lifecycle"='active' and "deal_stage_definitions"."archived_at" is null and "deal_stage_definitions"."archived_by_membership_id" is null) or ("deal_stage_definitions"."lifecycle"='archived' and "deal_stage_definitions"."archived_at" is not null and "deal_stage_definitions"."archived_by_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "deal_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_pipeline_id" uuid,
	"from_stage_id" uuid,
	"from_outcome_class" text,
	"to_pipeline_id" uuid NOT NULL,
	"to_stage_id" uuid NOT NULL,
	"to_outcome_class" text NOT NULL,
	"result_deal_version" integer NOT NULL,
	"changed_by_membership_id" uuid NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_stage_transitions_from_shape_check" CHECK (num_nonnulls("deal_stage_transitions"."from_pipeline_id","deal_stage_transitions"."from_stage_id","deal_stage_transitions"."from_outcome_class") in (0,3)),
	CONSTRAINT "deal_stage_transitions_outcome_check" CHECK (("deal_stage_transitions"."from_outcome_class" is null or "deal_stage_transitions"."from_outcome_class" in ('open','won','lost')) and "deal_stage_transitions"."to_outcome_class" in ('open','won','lost')),
	CONSTRAINT "deal_stage_transitions_version_check" CHECK ("deal_stage_transitions"."result_deal_version">0)
);
--> statement-breakpoint
CREATE TABLE "deal_visible_teams" (
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"visible_team_slot" integer NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_visible_teams_pk" PRIMARY KEY("workspace_id","deal_id","team_id"),
	CONSTRAINT "deal_visible_teams_slot_check" CHECK ("deal_visible_teams"."visible_team_slot" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"outcome_class" text NOT NULL,
	"name" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"amount_minor" numeric(20, 0),
	"currency_code" char(3),
	"currency_exponent" integer,
	"probability_bps" integer NOT NULL,
	"probability_source" text DEFAULT 'stage_default' NOT NULL,
	"expected_close_on" date,
	"stage_entered_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"lost_reason_code" text,
	"responsible_membership_id" uuid NOT NULL,
	"responsible_team_id" uuid,
	"visibility" text DEFAULT 'workspace' NOT NULL,
	"authority_contract_version" text DEFAULT 'sales-deal-v1' NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_name_check" CHECK ("deals"."name"=btrim("deals"."name") and char_length("deals"."name") between 1 and 200 and "deals"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "deals_lifecycle_check" CHECK ("deals"."lifecycle" in ('active','archived')),
	CONSTRAINT "deals_outcome_check" CHECK ("deals"."outcome_class" in ('open','won','lost')),
	CONSTRAINT "deals_money_check" CHECK (num_nonnulls("deals"."amount_minor","deals"."currency_code","deals"."currency_exponent")=0 or (num_nonnulls("deals"."amount_minor","deals"."currency_code","deals"."currency_exponent")=3 and "deals"."amount_minor" between 0 and 99999999999999999999 and ("deals"."currency_code","deals"."currency_exponent") in (('USD',2),('CAD',2)))),
	CONSTRAINT "deals_probability_check" CHECK ("deals"."probability_bps" between 0 and 10000 and "deals"."probability_source" in ('stage_default','manual_override') and ("deals"."outcome_class"<>'won' or "deals"."probability_bps"=10000) and ("deals"."outcome_class"<>'lost' or "deals"."probability_bps"=0)),
	CONSTRAINT "deals_close_check" CHECK (("deals"."outcome_class"='open' and "deals"."closed_at" is null and "deals"."lost_reason_code" is null) or ("deals"."outcome_class"='won' and "deals"."closed_at" is not null and "deals"."lost_reason_code" is null) or ("deals"."outcome_class"='lost' and "deals"."closed_at" is not null and "deals"."lost_reason_code" is not null and "deals"."lost_reason_code" in ('budget','timing','no_decision','competitor','needs_mismatch','other'))),
	CONSTRAINT "deals_visibility_check" CHECK ("deals"."visibility" in ('workspace','teams')),
	CONSTRAINT "deals_authority_check" CHECK ("deals"."authority_contract_version"='sales-deal-v1' and "deals"."version">0),
	CONSTRAINT "deals_archive_check" CHECK (("deals"."lifecycle"='active' and "deals"."archived_at" is null and "deals"."archived_by_membership_id" is null) or ("deals"."lifecycle"='archived' and "deals"."archived_at" is not null and "deals"."archived_by_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "lead_deal_conversion_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_record_type" text DEFAULT 'crm.lead' NOT NULL,
	"lead_record_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"contract_version" text DEFAULT 'lead-convert-to-deal.v1' NOT NULL,
	"source_lead_version" integer NOT NULL,
	"result_lead_version" integer NOT NULL,
	"result_deal_version" integer NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"converted_by_membership_id" uuid NOT NULL,
	"converted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_deal_conversion_lineage_contract_check" CHECK ("lead_deal_conversion_lineage"."lead_record_type"='crm.lead' and "lead_deal_conversion_lineage"."contract_version"='lead-convert-to-deal.v1'),
	CONSTRAINT "lead_deal_conversion_lineage_versions_check" CHECK ("lead_deal_conversion_lineage"."source_lead_version">0 and "lead_deal_conversion_lineage"."result_lead_version">"lead_deal_conversion_lineage"."source_lead_version" and "lead_deal_conversion_lineage"."result_deal_version">0)
);
--> statement-breakpoint
CREATE TABLE "sales_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"configuration_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_pipelines_code_check" CHECK ("sales_pipelines"."code" ~ '^sales\.[a-z][a-z0-9_]{1,55}$'),
	CONSTRAINT "sales_pipelines_label_check" CHECK ("sales_pipelines"."label"=btrim("sales_pipelines"."label") and char_length("sales_pipelines"."label") between 1 and 100 and "sales_pipelines"."label" !~ '[[:cntrl:]]'),
	CONSTRAINT "sales_pipelines_lifecycle_check" CHECK ("sales_pipelines"."lifecycle" in ('active','archived')),
	CONSTRAINT "sales_pipelines_version_check" CHECK ("sales_pipelines"."configuration_version">0 and "sales_pipelines"."version">0),
	CONSTRAINT "sales_pipelines_archive_check" CHECK (("sales_pipelines"."lifecycle"='active' and "sales_pipelines"."archived_at" is null and "sales_pipelines"."archived_by_membership_id" is null) or ("sales_pipelines"."lifecycle"='archived' and "sales_pipelines"."archived_at" is not null and "sales_pipelines"."archived_by_membership_id" is not null and not "sales_pipelines"."is_default"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_pipelines_workspace_id_id_uq" ON "sales_pipelines" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_definitions_stage_pipeline_outcome_uq" ON "deal_stage_definitions" USING btree ("workspace_id","id","pipeline_id","outcome_class");
--> statement-breakpoint
CREATE UNIQUE INDEX "deals_workspace_id_id_uq" ON "deals" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "deal_party_refs" ADD CONSTRAINT "deal_party_refs_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_party_refs" ADD CONSTRAINT "deal_party_refs_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_party_refs" ADD CONSTRAINT "deal_party_refs_ender_fk" FOREIGN KEY ("workspace_id","ended_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_definitions" ADD CONSTRAINT "deal_stage_definitions_pipeline_fk" FOREIGN KEY ("workspace_id","pipeline_id") REFERENCES "public"."sales_pipelines"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_definitions" ADD CONSTRAINT "deal_stage_definitions_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_definitions" ADD CONSTRAINT "deal_stage_definitions_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_definitions" ADD CONSTRAINT "deal_stage_definitions_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_transitions" ADD CONSTRAINT "deal_stage_transitions_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_transitions" ADD CONSTRAINT "deal_stage_transitions_from_stage_fk" FOREIGN KEY ("workspace_id","from_stage_id","from_pipeline_id","from_outcome_class") REFERENCES "public"."deal_stage_definitions"("workspace_id","id","pipeline_id","outcome_class") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_transitions" ADD CONSTRAINT "deal_stage_transitions_to_stage_fk" FOREIGN KEY ("workspace_id","to_stage_id","to_pipeline_id","to_outcome_class") REFERENCES "public"."deal_stage_definitions"("workspace_id","id","pipeline_id","outcome_class") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_transitions" ADD CONSTRAINT "deal_stage_transitions_actor_fk" FOREIGN KEY ("workspace_id","changed_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_visible_teams" ADD CONSTRAINT "deal_visible_teams_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_visible_teams" ADD CONSTRAINT "deal_visible_teams_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_visible_teams" ADD CONSTRAINT "deal_visible_teams_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_outcome_fk" FOREIGN KEY ("workspace_id","stage_id","pipeline_id","outcome_class") REFERENCES "public"."deal_stage_definitions"("workspace_id","id","pipeline_id","outcome_class") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_responsible_membership_fk" FOREIGN KEY ("workspace_id","responsible_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_responsible_team_fk" FOREIGN KEY ("workspace_id","responsible_team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_deal_conversion_lineage" ADD CONSTRAINT "lead_deal_conversion_lineage_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_deal_conversion_lineage" ADD CONSTRAINT "lead_deal_conversion_lineage_actor_fk" FOREIGN KEY ("workspace_id","converted_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipelines" ADD CONSTRAINT "sales_pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipelines" ADD CONSTRAINT "sales_pipelines_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipelines" ADD CONSTRAINT "sales_pipelines_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipelines" ADD CONSTRAINT "sales_pipelines_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_party_refs_workspace_id_id_uq" ON "deal_party_refs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_party_refs_active_record_uq" ON "deal_party_refs" USING btree ("workspace_id","deal_id","record_type","record_id") WHERE "deal_party_refs"."lifecycle"='active';--> statement-breakpoint
CREATE UNIQUE INDEX "deal_party_refs_active_company_uq" ON "deal_party_refs" USING btree ("workspace_id","deal_id","role_code") WHERE "deal_party_refs"."lifecycle"='active' and "deal_party_refs"."role_code"='customer_company';--> statement-breakpoint
CREATE UNIQUE INDEX "deal_party_refs_active_contact_slot_uq" ON "deal_party_refs" USING btree ("workspace_id","deal_id","contact_slot") WHERE "deal_party_refs"."lifecycle"='active' and "deal_party_refs"."record_type"='crm.contact';--> statement-breakpoint
CREATE UNIQUE INDEX "deal_party_refs_active_primary_contact_uq" ON "deal_party_refs" USING btree ("workspace_id","deal_id") WHERE "deal_party_refs"."lifecycle"='active' and "deal_party_refs"."record_type"='crm.contact' and "deal_party_refs"."is_primary";--> statement-breakpoint
CREATE INDEX "deal_party_refs_reverse_lookup_idx" ON "deal_party_refs" USING btree ("workspace_id","record_type","record_id","lifecycle","deal_id");--> statement-breakpoint
CREATE INDEX "deal_party_refs_deal_idx" ON "deal_party_refs" USING btree ("workspace_id","deal_id","lifecycle","role_code","contact_slot","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_definitions_workspace_id_id_uq" ON "deal_stage_definitions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_definitions_pipeline_code_uq" ON "deal_stage_definitions" USING btree ("workspace_id","pipeline_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_definitions_pipeline_sort_uq" ON "deal_stage_definitions" USING btree ("workspace_id","pipeline_id","sort_key");--> statement-breakpoint
CREATE INDEX "deal_stage_definitions_active_order_idx" ON "deal_stage_definitions" USING btree ("workspace_id","pipeline_id","lifecycle","sort_key","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_transitions_workspace_id_id_uq" ON "deal_stage_transitions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_transitions_deal_version_uq" ON "deal_stage_transitions" USING btree ("workspace_id","deal_id","result_deal_version");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_transitions_deal_operation_uq" ON "deal_stage_transitions" USING btree ("workspace_id","deal_id","governing_operation_id");--> statement-breakpoint
CREATE INDEX "deal_stage_transitions_timeline_idx" ON "deal_stage_transitions" USING btree ("workspace_id","deal_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "deal_visible_teams_slot_uq" ON "deal_visible_teams" USING btree ("workspace_id","deal_id","visible_team_slot");--> statement-breakpoint
CREATE INDEX "deal_visible_teams_team_idx" ON "deal_visible_teams" USING btree ("workspace_id","team_id","deal_id");--> statement-breakpoint
CREATE INDEX "deals_default_list_idx" ON "deals" USING btree ("workspace_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deals_board_stage_idx" ON "deals" USING btree ("workspace_id","pipeline_id","stage_id","lifecycle","stage_entered_at","id");--> statement-breakpoint
CREATE INDEX "deals_responsible_membership_idx" ON "deals" USING btree ("workspace_id","responsible_membership_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deals_responsible_team_idx" ON "deals" USING btree ("workspace_id","responsible_team_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "deals"."responsible_team_id" is not null;--> statement-breakpoint
CREATE INDEX "deals_overdue_candidates_idx" ON "deals" USING btree ("workspace_id","outcome_class","expected_close_on","id") WHERE "deals"."lifecycle"='active' and "deals"."outcome_class"='open' and "deals"."expected_close_on" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_deal_conversion_lineage_workspace_id_id_uq" ON "lead_deal_conversion_lineage" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_deal_conversion_lineage_lead_uq" ON "lead_deal_conversion_lineage" USING btree ("workspace_id","lead_record_type","lead_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_deal_conversion_lineage_deal_uq" ON "lead_deal_conversion_lineage" USING btree ("workspace_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_deal_conversion_lineage_operation_uq" ON "lead_deal_conversion_lineage" USING btree ("workspace_id","governing_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_pipelines_workspace_code_uq" ON "sales_pipelines" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_pipelines_active_default_uq" ON "sales_pipelines" USING btree ("workspace_id") WHERE "sales_pipelines"."lifecycle"='active' and "sales_pipelines"."is_default";--> statement-breakpoint
CREATE INDEX "sales_pipelines_active_order_idx" ON "sales_pipelines" USING btree ("workspace_id","lifecycle","is_default","label","id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sales_pipeline_code_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'sales_pipeline_code_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sales_pipeline_code_immutable_v1
BEFORE UPDATE ON sales_pipelines
FOR EACH ROW EXECUTE FUNCTION sales_pipeline_code_immutable_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION deal_stage_identity_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code OR NEW.outcome_class IS DISTINCT FROM OLD.outcome_class THEN
    RAISE EXCEPTION 'deal_stage_identity_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER deal_stage_identity_immutable_v1
BEFORE UPDATE ON deal_stage_definitions
FOR EACH ROW EXECUTE FUNCTION deal_stage_identity_immutable_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION deal_stage_transition_insert_only_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'deal_stage_transition_insert_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER deal_stage_transition_insert_only_v1
BEFORE UPDATE OR DELETE ON deal_stage_transitions
FOR EACH ROW EXECUTE FUNCTION deal_stage_transition_insert_only_v1();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_deal_conversion_lineage_insert_only_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lead_deal_conversion_lineage_insert_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_deal_conversion_lineage_insert_only_v1
BEFORE UPDATE OR DELETE ON lead_deal_conversion_lineage
FOR EACH ROW EXECUTE FUNCTION lead_deal_conversion_lineage_insert_only_v1();
