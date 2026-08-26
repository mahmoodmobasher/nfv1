CREATE TABLE "company_domain_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"domain_display" text NOT NULL,
	"domain_normalized" text NOT NULL,
	"normalization_version" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_record_id" uuid,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid,
	"updated_by_membership_id" uuid,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_domain_points_value_check" CHECK ("company_domain_points"."domain_display"=btrim("company_domain_points"."domain_display") and char_length("company_domain_points"."domain_display") between 1 and 253 and "company_domain_points"."domain_display" !~ '[[:cntrl:]]' and "company_domain_points"."domain_normalized"=lower(btrim("company_domain_points"."domain_normalized")) and char_length("company_domain_points"."domain_normalized") between 1 and 253 and "company_domain_points"."domain_normalized" !~ '[[:cntrl:]]' and "company_domain_points"."domain_normalized" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'),
	CONSTRAINT "company_domain_points_normalization_check" CHECK ("company_domain_points"."normalization_version"=btrim("company_domain_points"."normalization_version") and char_length("company_domain_points"."normalization_version") between 1 and 64 and "company_domain_points"."normalization_version" !~ '[[:cntrl:]]'),
	CONSTRAINT "company_domain_points_verification_check" CHECK (("company_domain_points"."verification_status"='unverified' and "company_domain_points"."verification_method" is null and "company_domain_points"."verified_at" is null) or ("company_domain_points"."verification_status"='verified' and "company_domain_points"."verification_method" in ('identity_review','provider','workspace_asserted') and "company_domain_points"."verified_at" is not null)),
	CONSTRAINT "company_domain_points_source_check" CHECK ("company_domain_points"."source" in ('legacy_root','lead_identity_review','manual','import','integration') and (("company_domain_points"."source" in ('lead_identity_review','import','integration') and "company_domain_points"."source_record_id" is not null) or ("company_domain_points"."source" in ('legacy_root','manual') and "company_domain_points"."source_record_id" is null))),
	CONSTRAINT "company_domain_points_lifecycle_check" CHECK ("company_domain_points"."lifecycle" in ('active','archived') and "company_domain_points"."version">0 and (("company_domain_points"."lifecycle"='active' and "company_domain_points"."archived_at" is null and "company_domain_points"."archived_by_membership_id" is null) or ("company_domain_points"."lifecycle"='archived' and not "company_domain_points"."is_primary" and "company_domain_points"."archived_at" is not null and "company_domain_points"."archived_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "company_visible_teams" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_visible_teams_pk" PRIMARY KEY("workspace_id","company_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "contact_company_affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role_code" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid,
	"ended_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_company_affiliations_role_check" CHECK ("contact_company_affiliations"."role_code" in ('employee','owner','executive','decision_maker','billing','technical','advisor','contractor','other')),
	CONSTRAINT "contact_company_affiliations_state_check" CHECK ("contact_company_affiliations"."lifecycle" in ('active','ended') and "contact_company_affiliations"."version">0 and (("contact_company_affiliations"."lifecycle"='active' and "contact_company_affiliations"."valid_to" is null and "contact_company_affiliations"."ended_by_membership_id" is null) or ("contact_company_affiliations"."lifecycle"='ended' and "contact_company_affiliations"."valid_to" is not null and "contact_company_affiliations"."valid_to">="contact_company_affiliations"."valid_from" and "contact_company_affiliations"."ended_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "contact_identity_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"display_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"phone_country_code_used" text,
	"normalization_version" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_record_id" uuid,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid,
	"updated_by_membership_id" uuid,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_identity_points_kind_check" CHECK ("contact_identity_points"."kind" in ('email','phone')),
	CONSTRAINT "contact_identity_points_value_shape_check" CHECK ((
      "contact_identity_points"."kind"='email' and char_length("contact_identity_points"."display_value") between 3 and 320 and char_length("contact_identity_points"."normalized_value") between 3 and 320
        and "contact_identity_points"."display_value"=btrim("contact_identity_points"."display_value") and "contact_identity_points"."normalized_value"=lower(btrim("contact_identity_points"."normalized_value"))
        and "contact_identity_points"."display_value" !~ '[[:cntrl:]]' and "contact_identity_points"."normalized_value" !~ '[[:cntrl:]]' and "contact_identity_points"."phone_country_code_used" is null
      ) or (
      "contact_identity_points"."kind"='phone' and char_length("contact_identity_points"."display_value") between 1 and 50 and char_length("contact_identity_points"."normalized_value") between 3 and 32
        and "contact_identity_points"."display_value"=btrim("contact_identity_points"."display_value") and "contact_identity_points"."normalized_value"=btrim("contact_identity_points"."normalized_value")
        and "contact_identity_points"."display_value" !~ '[[:cntrl:]]' and "contact_identity_points"."normalized_value" !~ '[[:cntrl:]]'
        and "contact_identity_points"."phone_country_code_used"=btrim("contact_identity_points"."phone_country_code_used") and char_length("contact_identity_points"."phone_country_code_used") between 2 and 16
        and "contact_identity_points"."phone_country_code_used" !~ '[[:cntrl:]]'
      )),
	CONSTRAINT "contact_identity_points_normalization_check" CHECK ("contact_identity_points"."normalization_version"=btrim("contact_identity_points"."normalization_version") and char_length("contact_identity_points"."normalization_version") between 1 and 64 and "contact_identity_points"."normalization_version" !~ '[[:cntrl:]]'),
	CONSTRAINT "contact_identity_points_verification_check" CHECK (("contact_identity_points"."verification_status"='unverified' and "contact_identity_points"."verification_method" is null and "contact_identity_points"."verified_at" is null) or ("contact_identity_points"."verification_status"='verified' and "contact_identity_points"."verification_method" in ('identity_review','provider','workspace_asserted') and "contact_identity_points"."verified_at" is not null)),
	CONSTRAINT "contact_identity_points_source_check" CHECK ("contact_identity_points"."source" in ('legacy_root','lead_identity_review','manual','import','integration') and (("contact_identity_points"."source" in ('lead_identity_review','import','integration') and "contact_identity_points"."source_record_id" is not null) or ("contact_identity_points"."source" in ('legacy_root','manual') and "contact_identity_points"."source_record_id" is null))),
	CONSTRAINT "contact_identity_points_lifecycle_check" CHECK ("contact_identity_points"."lifecycle" in ('active','archived') and "contact_identity_points"."version">0 and (("contact_identity_points"."lifecycle"='active' and "contact_identity_points"."archived_at" is null and "contact_identity_points"."archived_by_membership_id" is null) or ("contact_identity_points"."lifecycle"='archived' and not "contact_identity_points"."is_primary" and "contact_identity_points"."archived_at" is not null and "contact_identity_points"."archived_by_membership_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "contact_visible_teams" (
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_visible_teams_pk" PRIMARY KEY("workspace_id","contact_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "customer_graph_reconciliation_checkpoints" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stream" text NOT NULL,
	"last_updated_at" timestamp with time zone,
	"last_id" uuid,
	"processed_count" bigint DEFAULT 0 NOT NULL,
	"issue_count" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_graph_reconciliation_checkpoints_pk" PRIMARY KEY("workspace_id","run_id","stream"),
	CONSTRAINT "customer_graph_reconciliation_checkpoints_stream_check" CHECK ("customer_graph_reconciliation_checkpoints"."stream" in ('contact_email','contact_phone','contact_company','company_domain','root_authority')),
	CONSTRAINT "customer_graph_reconciliation_checkpoints_cursor_check" CHECK (("customer_graph_reconciliation_checkpoints"."last_updated_at" is null)=("customer_graph_reconciliation_checkpoints"."last_id" is null)),
	CONSTRAINT "customer_graph_reconciliation_checkpoints_counts_check" CHECK ("customer_graph_reconciliation_checkpoints"."processed_count">=0 and "customer_graph_reconciliation_checkpoints"."issue_count">=0 and "customer_graph_reconciliation_checkpoints"."version">0)
);
--> statement-breakpoint
CREATE TABLE "customer_graph_reconciliation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stream" text NOT NULL,
	"source_record_type" text NOT NULL,
	"source_record_id" uuid NOT NULL,
	"issue_code" text NOT NULL,
	"safe_metadata" jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"resolution_code" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_graph_reconciliation_issues_stream_check" CHECK ("customer_graph_reconciliation_issues"."stream" in ('contact_email','contact_phone','contact_company','company_domain','root_authority')),
	CONSTRAINT "customer_graph_reconciliation_issues_source_check" CHECK ("customer_graph_reconciliation_issues"."source_record_type" in ('contact','company')),
	CONSTRAINT "customer_graph_reconciliation_issues_code_check" CHECK ("customer_graph_reconciliation_issues"."issue_code" in ('missing_normalized_value','invalid_legacy_value','ambiguous_primary','missing_company','version_changed','authority_conflict')),
	CONSTRAINT "customer_graph_reconciliation_issues_state_check" CHECK ("customer_graph_reconciliation_issues"."state" in ('open','resolved','waived') and "customer_graph_reconciliation_issues"."version">0 and (("customer_graph_reconciliation_issues"."state"='open' and "customer_graph_reconciliation_issues"."resolution_code" is null) or ("customer_graph_reconciliation_issues"."state"='resolved' and "customer_graph_reconciliation_issues"."resolution_code" in ('source_corrected','accepted_legacy','not_applicable','superseded')) or ("customer_graph_reconciliation_issues"."state"='waived' and "customer_graph_reconciliation_issues"."resolution_code"='operator_waiver'))),
	CONSTRAINT "customer_graph_reconciliation_issues_metadata_check" CHECK (jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata")='object' and octet_length("customer_graph_reconciliation_issues"."safe_metadata"::text)<=1024 and (
      ("customer_graph_reconciliation_issues"."issue_code" in ('missing_normalized_value','missing_company') and "customer_graph_reconciliation_issues"."safe_metadata" ?& array['sourceVersion'] and ("customer_graph_reconciliation_issues"."safe_metadata"-array['sourceVersion'])='{}'::jsonb and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'sourceVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion')::numeric<=9007199254740991)
      or ("customer_graph_reconciliation_issues"."issue_code"='invalid_legacy_value' and "customer_graph_reconciliation_issues"."safe_metadata" ?& array['sourceVersion','validationCode'] and ("customer_graph_reconciliation_issues"."safe_metadata"-array['sourceVersion','validationCode'])='{}'::jsonb and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'sourceVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion')::numeric<=9007199254740991 and "customer_graph_reconciliation_issues"."safe_metadata"->>'validationCode' in ('email_format','phone_format','domain_format','normalization_mismatch'))
      or ("customer_graph_reconciliation_issues"."issue_code"='ambiguous_primary' and "customer_graph_reconciliation_issues"."safe_metadata" ?& array['sourceVersion','activeCandidateCount'] and ("customer_graph_reconciliation_issues"."safe_metadata"-array['sourceVersion','activeCandidateCount'])='{}'::jsonb and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'sourceVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion')::numeric<=9007199254740991 and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'activeCandidateCount')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'activeCandidateCount') ~ '^[0-9]+$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'activeCandidateCount')::numeric between 2 and 20)
      or ("customer_graph_reconciliation_issues"."issue_code"='version_changed' and "customer_graph_reconciliation_issues"."safe_metadata" ?& array['expectedVersion','observedVersion'] and ("customer_graph_reconciliation_issues"."safe_metadata"-array['expectedVersion','observedVersion'])='{}'::jsonb and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'expectedVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'expectedVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'expectedVersion')::numeric<=9007199254740991 and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'observedVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'observedVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'observedVersion')::numeric<=9007199254740991)
      or ("customer_graph_reconciliation_issues"."issue_code"='authority_conflict' and "customer_graph_reconciliation_issues"."safe_metadata" ?& array['sourceVersion','authorityContractVersion'] and ("customer_graph_reconciliation_issues"."safe_metadata"-array['sourceVersion','authorityContractVersion'])='{}'::jsonb and jsonb_typeof("customer_graph_reconciliation_issues"."safe_metadata"->'sourceVersion')='number' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion') ~ '^[1-9][0-9]*$' and ("customer_graph_reconciliation_issues"."safe_metadata"->>'sourceVersion')::numeric<=9007199254740991 and "customer_graph_reconciliation_issues"."safe_metadata"->>'authorityContractVersion' in ('legacy-p1a-root-v1','customer-graph-v1'))
    ))
);
--> statement-breakpoint
CREATE TABLE "customer_graph_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contract_version" text DEFAULT 'customer-graph-reconciliation.v1' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"source_cutoff" timestamp with time zone NOT NULL,
	"source_cutoff_id" uuid NOT NULL,
	"counts" jsonb DEFAULT '{"contactsScanned":0,"companiesScanned":0,"contactEmailPointsWritten":0,"contactPhonePointsWritten":0,"companyDomainPointsWritten":0,"affiliationsWritten":0,"issuesOpened":0,"issuesResolved":0}'::jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_graph_reconciliation_runs_contract_check" CHECK ("customer_graph_reconciliation_runs"."contract_version"='customer-graph-reconciliation.v1'),
	CONSTRAINT "customer_graph_reconciliation_runs_state_check" CHECK ("customer_graph_reconciliation_runs"."state" in ('pending','running','blocked','complete','abandoned') and "customer_graph_reconciliation_runs"."version">0 and (("customer_graph_reconciliation_runs"."state"='pending' and "customer_graph_reconciliation_runs"."started_at" is null and "customer_graph_reconciliation_runs"."completed_at" is null) or ("customer_graph_reconciliation_runs"."state" in ('running','blocked') and "customer_graph_reconciliation_runs"."started_at" is not null and "customer_graph_reconciliation_runs"."completed_at" is null) or ("customer_graph_reconciliation_runs"."state"='complete' and "customer_graph_reconciliation_runs"."started_at" is not null and "customer_graph_reconciliation_runs"."completed_at" is not null) or ("customer_graph_reconciliation_runs"."state"='abandoned' and "customer_graph_reconciliation_runs"."completed_at" is not null))),
	CONSTRAINT "customer_graph_reconciliation_runs_counts_check" CHECK (jsonb_typeof("customer_graph_reconciliation_runs"."counts")='object' and octet_length("customer_graph_reconciliation_runs"."counts"::text)<=1024 and "customer_graph_reconciliation_runs"."counts" ?& array['contactsScanned','companiesScanned','contactEmailPointsWritten','contactPhonePointsWritten','companyDomainPointsWritten','affiliationsWritten','issuesOpened','issuesResolved'] and ("customer_graph_reconciliation_runs"."counts"-array['contactsScanned','companiesScanned','contactEmailPointsWritten','contactPhonePointsWritten','companyDomainPointsWritten','affiliationsWritten','issuesOpened','issuesResolved'])='{}'::jsonb
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'contactsScanned')='number' and ("customer_graph_reconciliation_runs"."counts"->>'contactsScanned') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'contactsScanned')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'companiesScanned')='number' and ("customer_graph_reconciliation_runs"."counts"->>'companiesScanned') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'companiesScanned')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'contactEmailPointsWritten')='number' and ("customer_graph_reconciliation_runs"."counts"->>'contactEmailPointsWritten') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'contactEmailPointsWritten')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'contactPhonePointsWritten')='number' and ("customer_graph_reconciliation_runs"."counts"->>'contactPhonePointsWritten') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'contactPhonePointsWritten')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'companyDomainPointsWritten')='number' and ("customer_graph_reconciliation_runs"."counts"->>'companyDomainPointsWritten') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'companyDomainPointsWritten')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'affiliationsWritten')='number' and ("customer_graph_reconciliation_runs"."counts"->>'affiliationsWritten') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'affiliationsWritten')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'issuesOpened')='number' and ("customer_graph_reconciliation_runs"."counts"->>'issuesOpened') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'issuesOpened')::numeric<=9007199254740991
      and jsonb_typeof("customer_graph_reconciliation_runs"."counts"->'issuesResolved')='number' and ("customer_graph_reconciliation_runs"."counts"->>'issuesResolved') ~ '^[0-9]+$' and ("customer_graph_reconciliation_runs"."counts"->>'issuesResolved')::numeric<=9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "responsible_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "responsible_team_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "visibility" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "governing_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "created_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "updated_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "archived_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "authority_contract_version" text DEFAULT 'legacy-p1a-root-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "responsible_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "responsible_team_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "visibility" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "governing_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "created_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "updated_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "archived_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "authority_contract_version" text DEFAULT 'legacy-p1a-root-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_domain_points" ADD CONSTRAINT "company_domain_points_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domain_points" ADD CONSTRAINT "company_domain_points_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domain_points" ADD CONSTRAINT "company_domain_points_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domain_points" ADD CONSTRAINT "company_domain_points_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_visible_teams" ADD CONSTRAINT "company_visible_teams_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_visible_teams" ADD CONSTRAINT "company_visible_teams_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_visible_teams" ADD CONSTRAINT "company_visible_teams_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_company_affiliations" ADD CONSTRAINT "contact_company_affiliations_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_company_affiliations" ADD CONSTRAINT "contact_company_affiliations_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_company_affiliations" ADD CONSTRAINT "contact_company_affiliations_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_company_affiliations" ADD CONSTRAINT "contact_company_affiliations_ender_fk" FOREIGN KEY ("workspace_id","ended_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity_points" ADD CONSTRAINT "contact_identity_points_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity_points" ADD CONSTRAINT "contact_identity_points_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity_points" ADD CONSTRAINT "contact_identity_points_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity_points" ADD CONSTRAINT "contact_identity_points_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_visible_teams" ADD CONSTRAINT "contact_visible_teams_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_visible_teams" ADD CONSTRAINT "contact_visible_teams_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_visible_teams" ADD CONSTRAINT "contact_visible_teams_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_graph_reconciliation_runs_workspace_id_id_uq" ON "customer_graph_reconciliation_runs" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "customer_graph_reconciliation_checkpoints" ADD CONSTRAINT "customer_graph_reconciliation_checkpoints_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."customer_graph_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_graph_reconciliation_issues" ADD CONSTRAINT "customer_graph_reconciliation_issues_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."customer_graph_reconciliation_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_graph_reconciliation_runs" ADD CONSTRAINT "customer_graph_reconciliation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_graph_reconciliation_runs" ADD CONSTRAINT "customer_graph_reconciliation_runs_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_domain_points_workspace_id_id_uq" ON "company_domain_points" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_domain_points_active_value_uq" ON "company_domain_points" USING btree ("workspace_id","company_id","domain_normalized","normalization_version") WHERE "company_domain_points"."lifecycle"='active';--> statement-breakpoint
CREATE UNIQUE INDEX "company_domain_points_active_primary_uq" ON "company_domain_points" USING btree ("workspace_id","company_id") WHERE "company_domain_points"."lifecycle"='active' and "company_domain_points"."is_primary";--> statement-breakpoint
CREATE INDEX "company_domain_points_candidate_idx" ON "company_domain_points" USING btree ("workspace_id","domain_normalized","normalization_version","lifecycle","company_id","id");--> statement-breakpoint
CREATE INDEX "company_domain_points_owner_idx" ON "company_domain_points" USING btree ("workspace_id","company_id","lifecycle","is_primary" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "company_visible_teams_team_idx" ON "company_visible_teams" USING btree ("workspace_id","team_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_company_affiliations_workspace_id_id_uq" ON "contact_company_affiliations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_company_affiliations_active_pair_uq" ON "contact_company_affiliations" USING btree ("workspace_id","contact_id","company_id") WHERE "contact_company_affiliations"."lifecycle"='active';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_company_affiliations_active_primary_uq" ON "contact_company_affiliations" USING btree ("workspace_id","contact_id") WHERE "contact_company_affiliations"."lifecycle"='active' and "contact_company_affiliations"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_company_affiliations_contact_idx" ON "contact_company_affiliations" USING btree ("workspace_id","contact_id","lifecycle","is_primary" DESC NULLS LAST,"company_id","id");--> statement-breakpoint
CREATE INDEX "contact_company_affiliations_company_idx" ON "contact_company_affiliations" USING btree ("workspace_id","company_id","lifecycle","contact_id","id");--> statement-breakpoint
CREATE INDEX "contact_company_affiliations_history_idx" ON "contact_company_affiliations" USING btree ("workspace_id","contact_id","valid_from" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identity_points_workspace_id_id_uq" ON "contact_identity_points" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identity_points_active_value_uq" ON "contact_identity_points" USING btree ("workspace_id","contact_id","kind","normalized_value","normalization_version") WHERE "contact_identity_points"."lifecycle"='active';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identity_points_active_primary_uq" ON "contact_identity_points" USING btree ("workspace_id","contact_id","kind") WHERE "contact_identity_points"."lifecycle"='active' and "contact_identity_points"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_identity_points_candidate_idx" ON "contact_identity_points" USING btree ("workspace_id","kind","normalized_value","normalization_version","lifecycle","contact_id","id");--> statement-breakpoint
CREATE INDEX "contact_identity_points_owner_idx" ON "contact_identity_points" USING btree ("workspace_id","contact_id","kind","lifecycle","is_primary" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "contact_visible_teams_team_idx" ON "contact_visible_teams" USING btree ("workspace_id","team_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_graph_reconciliation_issues_workspace_id_id_uq" ON "customer_graph_reconciliation_issues" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_graph_reconciliation_issues_identity_uq" ON "customer_graph_reconciliation_issues" USING btree ("workspace_id","run_id","stream","source_record_id","issue_code");--> statement-breakpoint
CREATE INDEX "customer_graph_reconciliation_issues_lookup_idx" ON "customer_graph_reconciliation_issues" USING btree ("workspace_id","run_id","state","stream","source_record_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_graph_reconciliation_runs_running_uq" ON "customer_graph_reconciliation_runs" USING btree ("workspace_id") WHERE "customer_graph_reconciliation_runs"."state"='running';--> statement-breakpoint
CREATE INDEX "customer_graph_reconciliation_runs_state_idx" ON "customer_graph_reconciliation_runs" USING btree ("workspace_id","state","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_responsible_membership_fk" FOREIGN KEY ("workspace_id","responsible_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_responsible_team_fk" FOREIGN KEY ("workspace_id","responsible_team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_updater_membership_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_archiver_membership_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_responsible_membership_fk" FOREIGN KEY ("workspace_id","responsible_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_responsible_team_fk" FOREIGN KEY ("workspace_id","responsible_team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_updater_membership_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_archiver_membership_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_default_list_idx" ON "companies" USING btree ("workspace_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "companies_responsible_membership_idx" ON "companies" USING btree ("workspace_id","responsible_membership_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "companies"."responsible_membership_id" is not null;--> statement-breakpoint
CREATE INDEX "companies_responsible_team_idx" ON "companies" USING btree ("workspace_id","responsible_team_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "companies"."responsible_team_id" is not null;--> statement-breakpoint
CREATE INDEX "contacts_default_list_idx" ON "contacts" USING btree ("workspace_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contacts_responsible_membership_idx" ON "contacts" USING btree ("workspace_id","responsible_membership_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "contacts"."responsible_membership_id" is not null;--> statement-breakpoint
CREATE INDEX "contacts_responsible_team_idx" ON "contacts" USING btree ("workspace_id","responsible_team_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "contacts"."responsible_team_id" is not null;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_visibility_check" CHECK ("companies"."visibility" in ('workspace','teams'));--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_authority_contract_check" CHECK ("companies"."authority_contract_version" in ('legacy-p1a-root-v1','customer-graph-v1'));--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_archive_metadata_check" CHECK (("companies"."archived_at" is null)=("companies"."archived_by_membership_id" is null) and ("companies"."status"='archived' or ("companies"."archived_at" is null and "companies"."archived_by_membership_id" is null)) and ("companies"."authority_contract_version"='legacy-p1a-root-v1' or ("companies"."status"='active' and "companies"."archived_at" is null) or ("companies"."status"='archived' and "companies"."archived_at" is not null)));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_visibility_check" CHECK ("contacts"."visibility" in ('workspace','teams'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_authority_contract_check" CHECK ("contacts"."authority_contract_version" in ('legacy-p1a-root-v1','customer-graph-v1'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_archive_metadata_check" CHECK (("contacts"."archived_at" is null)=("contacts"."archived_by_membership_id" is null) and ("contacts"."status"='archived' or ("contacts"."archived_at" is null and "contacts"."archived_by_membership_id" is null)) and ("contacts"."authority_contract_version"='legacy-p1a-root-v1' or ("contacts"."status"='active' and "contacts"."archived_at" is null) or ("contacts"."status"='archived' and "contacts"."archived_at" is not null)));
--> statement-breakpoint
CREATE FUNCTION contact_identity_points_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'contact_identity_point_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'contact_identity_point_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.lifecycle='archived' THEN RAISE EXCEPTION 'contact_identity_point_archived_terminal'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.contact_id<>OLD.contact_id OR NEW.kind<>OLD.kind OR
     NEW.display_value<>OLD.display_value OR NEW.normalized_value<>OLD.normalized_value OR
     NEW.phone_country_code_used IS DISTINCT FROM OLD.phone_country_code_used OR
     NEW.normalization_version<>OLD.normalization_version OR NEW.source<>OLD.source OR
     NEW.source_record_id IS DISTINCT FROM OLD.source_record_id OR
     NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'contact_identity_point_identity_immutable';
  END IF;
  IF NEW.lifecycle NOT IN ('active','archived') OR NEW.version<>OLD.version+1 OR
     NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'contact_identity_point_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contact_identity_points_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON contact_identity_points
FOR EACH ROW EXECUTE FUNCTION contact_identity_points_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION company_domain_points_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'company_domain_point_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'company_domain_point_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.lifecycle='archived' THEN RAISE EXCEPTION 'company_domain_point_archived_terminal'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.company_id<>OLD.company_id OR
     NEW.domain_display<>OLD.domain_display OR NEW.domain_normalized<>OLD.domain_normalized OR
     NEW.normalization_version<>OLD.normalization_version OR NEW.source<>OLD.source OR
     NEW.source_record_id IS DISTINCT FROM OLD.source_record_id OR
     NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'company_domain_point_identity_immutable';
  END IF;
  IF NEW.lifecycle NOT IN ('active','archived') OR NEW.version<>OLD.version+1 OR
     NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'company_domain_point_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER company_domain_points_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON company_domain_points
FOR EACH ROW EXECUTE FUNCTION company_domain_points_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION contact_company_affiliations_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'contact_company_affiliation_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.valid_to IS NOT NULL OR NEW.ended_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'contact_company_affiliation_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.lifecycle<>'active' OR NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR
     NEW.contact_id<>OLD.contact_id OR NEW.company_id<>OLD.company_id OR NEW.role_code<>OLD.role_code OR
     NEW.is_primary<>OLD.is_primary OR NEW.valid_from<>OLD.valid_from OR
     NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at OR
     NEW.lifecycle<>'ended' OR NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR
     NEW.valid_to IS NULL OR NEW.valid_to<OLD.valid_from OR NEW.ended_by_membership_id IS NULL OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'contact_company_affiliation_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contact_company_affiliations_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON contact_company_affiliations
FOR EACH ROW EXECUTE FUNCTION contact_company_affiliations_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION customer_graph_reconciliation_runs_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer_graph_reconciliation_run_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending' OR NEW.version<>1 OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'customer_graph_reconciliation_run_initial_state_invalid';
    END IF;
    FOR key IN SELECT unnest(ARRAY['contactsScanned','companiesScanned','contactEmailPointsWritten','contactPhonePointsWritten','companyDomainPointsWritten','affiliationsWritten','issuesOpened','issuesResolved']) LOOP
      IF (NEW.counts->>key)::numeric<>0 THEN RAISE EXCEPTION 'customer_graph_reconciliation_run_initial_counts_invalid'; END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.contract_version<>OLD.contract_version OR
     NEW.source_cutoff<>OLD.source_cutoff OR NEW.source_cutoff_id<>OLD.source_cutoff_id OR NEW.operation_id<>OLD.operation_id OR
     NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at OR
     NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_run_identity_invalid';
  END IF;
  IF NOT ((OLD.state='pending' AND NEW.state IN ('running','abandoned')) OR
          (OLD.state='running' AND NEW.state IN ('blocked','complete','abandoned')) OR
          (OLD.state='blocked' AND NEW.state IN ('running','abandoned'))) THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_run_transition_invalid';
  END IF;
  IF OLD.started_at IS NULL THEN
    IF NEW.state='running' AND NEW.started_at IS NULL THEN RAISE EXCEPTION 'customer_graph_reconciliation_run_start_required'; END IF;
    IF NEW.state<>'running' AND NEW.started_at IS NOT NULL THEN RAISE EXCEPTION 'customer_graph_reconciliation_run_start_invalid'; END IF;
  ELSIF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_run_start_immutable';
  END IF;
  FOR key IN SELECT unnest(ARRAY['contactsScanned','companiesScanned','contactEmailPointsWritten','contactPhonePointsWritten','companyDomainPointsWritten','affiliationsWritten','issuesOpened','issuesResolved']) LOOP
    IF (NEW.counts->>key)::numeric<(OLD.counts->>key)::numeric THEN
      RAISE EXCEPTION 'customer_graph_reconciliation_run_count_decreased';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_graph_reconciliation_runs_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON customer_graph_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION customer_graph_reconciliation_runs_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION customer_graph_reconciliation_checkpoints_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_initial_state_invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.workspace_id<>OLD.workspace_id OR NEW.run_id<>OLD.run_id OR NEW.stream<>OLD.stream OR
     NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at OR
     NEW.processed_count<OLD.processed_count OR NEW.issue_count<OLD.issue_count THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_transition_invalid';
  END IF;
  IF OLD.last_updated_at IS NOT NULL THEN
    IF NEW.last_updated_at IS NULL OR ROW(NEW.last_updated_at,NEW.last_id)<ROW(OLD.last_updated_at,OLD.last_id) THEN
      RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_cursor_regressed';
    END IF;
    IF ROW(NEW.last_updated_at,NEW.last_id)=ROW(OLD.last_updated_at,OLD.last_id) AND
       NEW.processed_count=OLD.processed_count AND NEW.issue_count=OLD.issue_count THEN
      RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_no_progress';
    END IF;
  ELSIF NEW.last_updated_at IS NULL AND NEW.processed_count=OLD.processed_count AND NEW.issue_count=OLD.issue_count THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_checkpoint_no_progress';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_graph_reconciliation_checkpoints_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON customer_graph_reconciliation_checkpoints
FOR EACH ROW EXECUTE FUNCTION customer_graph_reconciliation_checkpoints_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION customer_graph_reconciliation_issues_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer_graph_reconciliation_issue_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'open' OR NEW.version<>1 OR NEW.resolution_code IS NOT NULL THEN
      RAISE EXCEPTION 'customer_graph_reconciliation_issue_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state<>'open' OR NEW.state NOT IN ('resolved','waived') OR
     NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.run_id<>OLD.run_id OR NEW.stream<>OLD.stream OR
     NEW.source_record_type<>OLD.source_record_type OR NEW.source_record_id<>OLD.source_record_id OR
     NEW.issue_code<>OLD.issue_code OR NEW.safe_metadata<>OLD.safe_metadata OR NEW.created_at<>OLD.created_at OR
     NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'customer_graph_reconciliation_issue_transition_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_graph_reconciliation_issues_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON customer_graph_reconciliation_issues
FOR EACH ROW EXECUTE FUNCTION customer_graph_reconciliation_issues_enforce_v1();
