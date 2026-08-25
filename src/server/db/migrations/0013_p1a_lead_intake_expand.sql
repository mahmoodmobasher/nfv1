CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"domain_normalized" text,
	"normalization_version" text DEFAULT 'p1a-identity-v1' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_check" CHECK (length(btrim("companies"."display_name")) between 1 and 200 and length("companies"."name_normalized") between 1 and 200),
	CONSTRAINT "companies_status_check" CHECK ("companies"."status" in ('active','archived')),
	CONSTRAINT "companies_version_check" CHECK ("companies"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"person_name_normalized" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email_display" text,
	"email_normalized" text,
	"phone_display" text,
	"phone_normalized" text,
	"phone_country_code_used" text,
	"normalization_version" text DEFAULT 'p1a-identity-v1' NOT NULL,
	"company_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_name_check" CHECK (length(btrim("contacts"."display_name")) between 1 and 200),
	CONSTRAINT "contacts_normalized_name_check" CHECK (length("contacts"."person_name_normalized") between 1 and 200 and "contacts"."person_name_normalized"=btrim("contacts"."person_name_normalized")),
	CONSTRAINT "contacts_email_pair_check" CHECK (("contacts"."email_display" is null) = ("contacts"."email_normalized" is null)),
	CONSTRAINT "contacts_email_check" CHECK ("contacts"."email_normalized" is null or (length("contacts"."email_normalized") between 3 and 320 and "contacts"."email_normalized"=lower(btrim("contacts"."email_normalized")))),
	CONSTRAINT "contacts_phone_pair_check" CHECK (("contacts"."phone_display" is null and "contacts"."phone_normalized" is null and "contacts"."phone_country_code_used" is null) or ("contacts"."phone_display" is not null and "contacts"."phone_normalized" is not null and length(btrim("contacts"."phone_country_code_used")) between 2 and 16)),
	CONSTRAINT "contacts_identity_check" CHECK ("contacts"."email_normalized" is not null or "contacts"."phone_normalized" is not null or length(btrim("contacts"."display_name")) > 0),
	CONSTRAINT "contacts_status_check" CHECK ("contacts"."status" in ('active','archived')),
	CONSTRAINT "contacts_version_check" CHECK ("contacts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lead_identity_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"evidence_kind" text NOT NULL,
	"evidence_strength" text NOT NULL,
	"normalization_version" text NOT NULL,
	"target_version" integer NOT NULL,
	"evidence_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_identity_candidates_target_check" CHECK ((("lead_identity_candidates"."contact_id" is not null)::int + ("lead_identity_candidates"."company_id" is not null)::int)=1),
	CONSTRAINT "lead_identity_candidates_evidence_check" CHECK ("lead_identity_candidates"."evidence_kind" in ('email','phone','name_company') and "lead_identity_candidates"."evidence_strength" in ('strong','supplementary','probable')),
	CONSTRAINT "lead_identity_candidates_strength_check" CHECK (("lead_identity_candidates"."evidence_kind"='email' and "lead_identity_candidates"."evidence_strength"='strong') or ("lead_identity_candidates"."evidence_kind"='phone' and "lead_identity_candidates"."evidence_strength"='supplementary') or ("lead_identity_candidates"."evidence_kind"='name_company' and "lead_identity_candidates"."evidence_strength"='probable')),
	CONSTRAINT "lead_identity_candidates_version_check" CHECK ("lead_identity_candidates"."target_version" > 0),
	CONSTRAINT "lead_identity_candidates_metadata_check" CHECK (jsonb_typeof("lead_identity_candidates"."evidence_metadata")='object' and ("lead_identity_candidates"."evidence_metadata" - array['match_key_version']::text[])='{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "lead_identity_decision_heads" (
	"workspace_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_identity_decision_heads_pk" PRIMARY KEY("workspace_id","intake_id"),
	CONSTRAINT "lead_identity_decision_heads_version_check" CHECK ("lead_identity_decision_heads"."version">0)
);
--> statement-breakpoint
CREATE TABLE "lead_identity_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"operation" text DEFAULT 'lead-identity-review-decision.v1' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"request_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"supersedes_decision_id" uuid,
	"governing_outcome" text NOT NULL,
	"contact_action" text,
	"company_action" text,
	"contact_id" uuid,
	"company_id" uuid,
	"contact_candidate_id" uuid,
	"company_candidate_id" uuid,
	"contact_target_version" integer,
	"company_target_version" integer,
	"actor_membership_id" uuid NOT NULL,
	"expected_lead_version" integer NOT NULL,
	"expected_review_version" integer NOT NULL,
	"expected_intake_version" integer NOT NULL,
	"result_lead_version" integer NOT NULL,
	"result_review_version" integer NOT NULL,
	"contract_version" text NOT NULL,
	"normalization_version" text NOT NULL,
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_identity_decisions_operation_check" CHECK ("lead_identity_decisions"."operation"='lead-identity-review-decision.v1' and length("lead_identity_decisions"."idempotency_key") between 16 and 128 and length("lead_identity_decisions"."request_hash") between 32 and 128),
	CONSTRAINT "lead_identity_decisions_outcome_check" CHECK ("lead_identity_decisions"."governing_outcome" in ('hold','resolve')),
	CONSTRAINT "lead_identity_decisions_actions_check" CHECK (("lead_identity_decisions"."governing_outcome"='hold' and num_nonnulls("lead_identity_decisions"."contact_action","lead_identity_decisions"."company_action","lead_identity_decisions"."contact_id","lead_identity_decisions"."company_id","lead_identity_decisions"."contact_candidate_id","lead_identity_decisions"."company_candidate_id","lead_identity_decisions"."contact_target_version","lead_identity_decisions"."company_target_version")=0) or ("lead_identity_decisions"."governing_outcome"='resolve' and "lead_identity_decisions"."contact_action" in ('create','link','dismiss') and "lead_identity_decisions"."company_action" in ('create','link','dismiss') and (("lead_identity_decisions"."contact_action"='dismiss' and num_nonnulls("lead_identity_decisions"."contact_id","lead_identity_decisions"."contact_candidate_id","lead_identity_decisions"."contact_target_version")=0) or ("lead_identity_decisions"."contact_action"='create' and "lead_identity_decisions"."contact_id" is not null and "lead_identity_decisions"."contact_candidate_id" is null and "lead_identity_decisions"."contact_target_version">0) or ("lead_identity_decisions"."contact_action"='link' and "lead_identity_decisions"."contact_id" is not null and "lead_identity_decisions"."contact_candidate_id" is not null and "lead_identity_decisions"."contact_target_version">0)) and (("lead_identity_decisions"."company_action"='dismiss' and num_nonnulls("lead_identity_decisions"."company_id","lead_identity_decisions"."company_candidate_id","lead_identity_decisions"."company_target_version")=0) or ("lead_identity_decisions"."company_action"='create' and "lead_identity_decisions"."company_id" is not null and "lead_identity_decisions"."company_candidate_id" is null and "lead_identity_decisions"."company_target_version">0) or ("lead_identity_decisions"."company_action"='link' and "lead_identity_decisions"."company_id" is not null and "lead_identity_decisions"."company_candidate_id" is not null and "lead_identity_decisions"."company_target_version">0)))),
	CONSTRAINT "lead_identity_decisions_version_check" CHECK ("lead_identity_decisions"."expected_lead_version">0 and "lead_identity_decisions"."expected_review_version">0 and "lead_identity_decisions"."expected_intake_version">0 and "lead_identity_decisions"."result_lead_version">0 and "lead_identity_decisions"."result_review_version">0)
);
--> statement-breakpoint
CREATE TABLE "lead_identity_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_identity_reviews_state_check" CHECK ("lead_identity_reviews"."state" in ('pending','resolved')),
	CONSTRAINT "lead_identity_reviews_resolution_check" CHECK (("lead_identity_reviews"."state"='pending' and "lead_identity_reviews"."resolved_at" is null and "lead_identity_reviews"."resolved_by_membership_id" is null) or ("lead_identity_reviews"."state"='resolved' and "lead_identity_reviews"."resolved_at" is not null and "lead_identity_reviews"."resolved_by_membership_id" is not null)),
	CONSTRAINT "lead_identity_reviews_version_check" CHECK ("lead_identity_reviews"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lead_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation" text DEFAULT 'lead-inquiry-intake.v1' NOT NULL,
	"intake_channel" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"actor_membership_id" uuid,
	"request_hash" text NOT NULL,
	"contract_version" text NOT NULL,
	"normalization_version" text NOT NULL,
	"attribution_contract_version" text NOT NULL,
	"source_category" text NOT NULL,
	"source_platform" text,
	"source_medium" text NOT NULL,
	"source_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"campaign_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"lead_id" uuid,
	"outcome" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_intakes_operation_check" CHECK ("lead_intakes"."operation"='lead-inquiry-intake.v1'),
	CONSTRAINT "lead_intakes_actor_check" CHECK ("lead_intakes"."intake_channel" not in ('manual','csv','spreadsheet') or "lead_intakes"."actor_membership_id" is not null),
	CONSTRAINT "lead_intakes_channel_check" CHECK ("lead_intakes"."intake_channel" in ('manual','csv','spreadsheet','web_form','future_api','future_integration')),
	CONSTRAINT "lead_intakes_key_check" CHECK (length("lead_intakes"."idempotency_key") between 16 and 128 and length("lead_intakes"."request_hash") between 32 and 128),
	CONSTRAINT "lead_intakes_source_check" CHECK ("lead_intakes"."source_category" in ('website','referral','outbound','event','partner','social_media','import','manual','other')),
	CONSTRAINT "lead_intakes_social_platform_check" CHECK (coalesce(("lead_intakes"."source_category"='social_media' and "lead_intakes"."source_platform" in ('tiktok','instagram','facebook','linkedin','x','youtube','other_social') and ("lead_intakes"."source_platform"<>'other_social' or length(btrim(coalesce("lead_intakes"."source_detail"->>'platform_context',''))) between 1 and 200)) or ("lead_intakes"."source_category"<>'social_media' and "lead_intakes"."source_platform" is null),false)),
	CONSTRAINT "lead_intakes_medium_check" CHECK ("lead_intakes"."source_medium" in ('organic','paid','unknown')),
	CONSTRAINT "lead_intakes_detail_check" CHECK (jsonb_typeof("lead_intakes"."source_detail")='object' and octet_length("lead_intakes"."source_detail"::text)<=2048),
	CONSTRAINT "lead_intakes_campaign_check" CHECK (jsonb_typeof("lead_intakes"."campaign_context")='object' and octet_length("lead_intakes"."campaign_context"::text)<=2048),
	CONSTRAINT "lead_intakes_state_check" CHECK ("lead_intakes"."state" in ('pending','committed')),
	CONSTRAINT "lead_intakes_outcome_check" CHECK (("lead_intakes"."state"='pending' and "lead_intakes"."lead_id" is null and "lead_intakes"."outcome" is null) or ("lead_intakes"."state"='committed' and "lead_intakes"."lead_id" is not null and jsonb_typeof("lead_intakes"."outcome")='object')),
	CONSTRAINT "lead_intakes_version_check" CHECK ("lead_intakes"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lead_lifecycle_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contract_version" text DEFAULT 'p1a-lifecycle-v1' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_lifecycle_definitions_code_check" CHECK ("lead_lifecycle_definitions"."code" in ('new','working','qualified','disqualified','converted')),
	CONSTRAINT "lead_lifecycle_definitions_label_check" CHECK (length(btrim("lead_lifecycle_definitions"."label")) between 1 and 80),
	CONSTRAINT "lead_lifecycle_definitions_order_check" CHECK ("lead_lifecycle_definitions"."display_order" >= 0),
	CONSTRAINT "lead_lifecycle_definitions_status_check" CHECK ("lead_lifecycle_definitions"."status" in ('active','archived')),
	CONSTRAINT "lead_lifecycle_definitions_version_check" CHECK ("lead_lifecycle_definitions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_name_check";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_email_check";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_company_check";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_source_check";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "first_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "email_normalized" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "email_display" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "company" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "owner_membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "person_name_normalized" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone_normalized" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone_country_code_used" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalization_version" text DEFAULT 'p1a-identity-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_source_category" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_source_platform" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_source_medium" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_source_detail" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_campaign_context" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "attribution_contract_version" text DEFAULT 'p1a-attribution-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "intake_channel" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lifecycle_definition_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "identity_review_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "responsible_team_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "result_version" integer;--> statement-breakpoint
CREATE TABLE "p1a_migration_checkpoints" (
  "migration_key" text PRIMARY KEY,
  "last_lead_id" uuid,
  "rows_processed" bigint NOT NULL DEFAULT 0,
  "batches_committed" integer NOT NULL DEFAULT 0,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "p1a_migration_checkpoints_rows_check" CHECK (rows_processed>=0 AND batches_committed>=0)
);--> statement-breakpoint
INSERT INTO "lead_lifecycle_definitions" ("id","code","label","display_order","is_terminal") VALUES
 ('00000000-0000-4000-8000-000000000001','new','New',0,false),
 ('00000000-0000-4000-8000-000000000002','working','Working',1,false),
 ('00000000-0000-4000-8000-000000000003','qualified','Qualified',2,false),
 ('00000000-0000-4000-8000-000000000004','disqualified','Disqualified',3,true),
 ('00000000-0000-4000-8000-000000000005','converted','Converted',4,true);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_workspace_id_id_uq" ON "companies" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_id_id_uq" ON "contacts" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_workspace_id_id_uq" ON "lead_identity_candidates" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_workspace_review_id_uq" ON "lead_identity_candidates" ("workspace_id","review_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_reviews_workspace_id_id_uq" ON "lead_identity_reviews" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_intakes_workspace_id_id_uq" ON "lead_intakes" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decisions_workspace_id_id_uq" ON "lead_identity_decisions" ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decisions_workspace_intake_id_uq" ON "lead_identity_decisions" ("workspace_id","intake_id","id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_candidates" ADD CONSTRAINT "lead_identity_candidates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_candidates" ADD CONSTRAINT "lead_identity_candidates_workspace_review_fk" FOREIGN KEY ("workspace_id","review_id") REFERENCES "public"."lead_identity_reviews"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_candidates" ADD CONSTRAINT "lead_identity_candidates_workspace_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_candidates" ADD CONSTRAINT "lead_identity_candidates_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decision_heads" ADD CONSTRAINT "lead_identity_decision_heads_workspace_intake_fk" FOREIGN KEY ("workspace_id","intake_id") REFERENCES "public"."lead_intakes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decision_heads" ADD CONSTRAINT "lead_identity_decision_heads_workspace_decision_fk" FOREIGN KEY ("workspace_id","intake_id","decision_id") REFERENCES "public"."lead_identity_decisions"("workspace_id","intake_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_intake_fk" FOREIGN KEY ("workspace_id","intake_id") REFERENCES "public"."lead_intakes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_review_fk" FOREIGN KEY ("workspace_id","review_id") REFERENCES "public"."lead_identity_reviews"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_contact_candidate_fk" FOREIGN KEY ("workspace_id","review_id","contact_candidate_id") REFERENCES "public"."lead_identity_candidates"("workspace_id","review_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_company_candidate_fk" FOREIGN KEY ("workspace_id","review_id","company_candidate_id") REFERENCES "public"."lead_identity_candidates"("workspace_id","review_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_decisions" ADD CONSTRAINT "lead_identity_decisions_workspace_supersedes_fk" FOREIGN KEY ("workspace_id","intake_id","supersedes_decision_id") REFERENCES "public"."lead_identity_decisions"("workspace_id","intake_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_reviews" ADD CONSTRAINT "lead_identity_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_reviews" ADD CONSTRAINT "lead_identity_reviews_workspace_intake_fk" FOREIGN KEY ("workspace_id","intake_id") REFERENCES "public"."lead_intakes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_reviews" ADD CONSTRAINT "lead_identity_reviews_workspace_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_reviews" ADD CONSTRAINT "lead_identity_reviews_workspace_resolver_fk" FOREIGN KEY ("workspace_id","resolved_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intakes" ADD CONSTRAINT "lead_intakes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intakes" ADD CONSTRAINT "lead_intakes_workspace_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intakes" ADD CONSTRAINT "lead_intakes_workspace_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_workspace_id_id_uq" ON "companies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "companies_workspace_name_idx" ON "companies" USING btree ("workspace_id","name_normalized","id");--> statement-breakpoint
CREATE INDEX "companies_workspace_domain_idx" ON "companies" USING btree ("workspace_id","domain_normalized","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_id_id_uq" ON "contacts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "contacts_workspace_email_idx" ON "contacts" USING btree ("workspace_id","email_normalized","id");--> statement-breakpoint
CREATE INDEX "contacts_workspace_phone_idx" ON "contacts" USING btree ("workspace_id","phone_normalized","id");--> statement-breakpoint
CREATE INDEX "contacts_workspace_name_company_idx" ON "contacts" USING btree ("workspace_id","person_name_normalized","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_workspace_id_id_uq" ON "lead_identity_candidates" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_workspace_review_id_uq" ON "lead_identity_candidates" USING btree ("workspace_id","review_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_contact_uq" ON "lead_identity_candidates" USING btree ("workspace_id","review_id","contact_id","evidence_kind","normalization_version") WHERE "lead_identity_candidates"."contact_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_candidates_company_uq" ON "lead_identity_candidates" USING btree ("workspace_id","review_id","company_id","evidence_kind","normalization_version") WHERE "lead_identity_candidates"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "lead_identity_candidates_review_idx" ON "lead_identity_candidates" USING btree ("workspace_id","review_id","evidence_strength","evidence_kind","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decision_heads_decision_uq" ON "lead_identity_decision_heads" USING btree ("workspace_id","decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decisions_workspace_id_id_uq" ON "lead_identity_decisions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decisions_workspace_intake_id_uq" ON "lead_identity_decisions" USING btree ("workspace_id","intake_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_decisions_idempotency_uq" ON "lead_identity_decisions" USING btree ("workspace_id","operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "lead_identity_decisions_review_idx" ON "lead_identity_decisions" USING btree ("workspace_id","review_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_reviews_workspace_id_id_uq" ON "lead_identity_reviews" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_identity_reviews_pending_lead_uq" ON "lead_identity_reviews" USING btree ("workspace_id","lead_id") WHERE "lead_identity_reviews"."state"='pending';--> statement-breakpoint
CREATE INDEX "lead_identity_reviews_workspace_state_idx" ON "lead_identity_reviews" USING btree ("workspace_id","state","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_intakes_workspace_id_id_uq" ON "lead_intakes" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_intakes_idempotency_uq" ON "lead_intakes" USING btree ("workspace_id","operation","intake_channel","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_intakes_lead_uq" ON "lead_intakes" USING btree ("workspace_id","lead_id") WHERE "lead_intakes"."lead_id" is not null;--> statement-breakpoint
CREATE INDEX "lead_intakes_workspace_state_idx" ON "lead_intakes" USING btree ("workspace_id","state","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_lifecycle_definitions_code_uq" ON "lead_lifecycle_definitions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_lifecycle_definitions_order_uq" ON "lead_lifecycle_definitions" USING btree ("display_order");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lifecycle_definition_id_lead_lifecycle_definitions_id_fk" FOREIGN KEY ("lifecycle_definition_id") REFERENCES "public"."lead_lifecycle_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_responsible_team_fk" FOREIGN KEY ("workspace_id","responsible_team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_workspace_phone_idx" ON "leads" USING btree ("workspace_id","phone_normalized","id");--> statement-breakpoint
CREATE INDEX "leads_workspace_name_company_idx" ON "leads" USING btree ("workspace_id","person_name_normalized","company_id","id");--> statement-breakpoint
CREATE INDEX "leads_workspace_lifecycle_idx" ON "leads" USING btree ("workspace_id","lifecycle_definition_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "leads_workspace_review_idx" ON "leads" USING btree ("workspace_id","identity_review_status","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_operation_event_uq" ON "outbox_messages" USING btree ("workspace_id","topic","aggregate_type","aggregate_id","operation_id","result_version") WHERE "outbox_messages"."workspace_id" is not null and "outbox_messages"."aggregate_id" is not null and "outbox_messages"."operation_id" is not null and "outbox_messages"."result_version" is not null;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_email_pair_check" CHECK (("leads"."email_display" is null) = ("leads"."email_normalized" is null));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_identity_check" CHECK ("leads"."email_normalized" is not null or "leads"."phone_normalized" is not null);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_phone_pair_check" CHECK (("leads"."phone" is null and "leads"."phone_normalized" is null and "leads"."phone_country_code_used" is null) or ("leads"."lifecycle_definition_id" is null and "leads"."phone" is not null and "leads"."phone_normalized" is null and "leads"."phone_country_code_used" is null) or ("leads"."phone" is not null and "leads"."phone_normalized" is not null and length(btrim("leads"."phone_country_code_used")) between 2 and 16));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_medium_check" CHECK ("leads"."original_source_medium" in ('organic','paid','unknown'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_detail_check" CHECK (jsonb_typeof("leads"."original_source_detail")='object' and octet_length("leads"."original_source_detail"::text)<=2048);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_context_check" CHECK (jsonb_typeof("leads"."original_campaign_context")='object' and octet_length("leads"."original_campaign_context"::text)<=2048);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_intake_channel_check" CHECK ("leads"."intake_channel" in ('web_form','manual','csv','spreadsheet','future_api','future_integration'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_review_status_check" CHECK ("leads"."identity_review_status" in ('not_required','pending','resolved'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_email_check" CHECK ("leads"."email_normalized" is null or (length("leads"."email_normalized") between 3 and 320 and "leads"."email_normalized"=lower(btrim("leads"."email_normalized"))));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_check" CHECK ("leads"."company" is null or length(btrim("leads"."company")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('website','referral','outbound','event','partner','social_media','import','manual','other'));--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_result_version_check" CHECK ("outbox_messages"."result_version" is null or "outbox_messages"."result_version">0);
--> statement-breakpoint
CREATE FUNCTION p1a_protect_lifecycle_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'lifecycle identity is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;--> statement-breakpoint
CREATE TRIGGER lead_lifecycle_identity_immutable BEFORE UPDATE ON lead_lifecycle_definitions FOR EACH ROW EXECUTE FUNCTION p1a_protect_lifecycle_identity();--> statement-breakpoint
CREATE FUNCTION p1a_lead_compatibility_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.display_name IS NULL THEN NEW.display_name:=nullif(btrim(concat_ws(' ',NEW.first_name,NEW.last_name)),''); END IF;
  IF NEW.person_name_normalized IS NULL THEN NEW.person_name_normalized:=lower(NEW.display_name); END IF;
  IF NEW.original_source_category IS NULL THEN NEW.original_source_category:=NEW.source; END IF;
  IF NEW.received_at IS NULL THEN NEW.received_at:=coalesce(NEW.created_at,now()); END IF;
  IF NEW.lifecycle_definition_id IS NULL THEN SELECT id INTO NEW.lifecycle_definition_id FROM lead_lifecycle_definitions WHERE code='new'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER leads_p1a_compatibility_defaults BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION p1a_lead_compatibility_defaults();--> statement-breakpoint
CREATE FUNCTION p1a_protect_lead_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle_definition_id IS NOT NULL AND NEW.lifecycle_definition_id IS NULL THEN RAISE EXCEPTION 'assigned lifecycle identity cannot be cleared' USING ERRCODE='23514'; END IF;
  IF (OLD.original_source_category IS NOT NULL AND NEW.original_source_category IS DISTINCT FROM OLD.original_source_category) OR NEW.original_source_platform IS DISTINCT FROM OLD.original_source_platform
     OR NEW.original_source_medium IS DISTINCT FROM OLD.original_source_medium OR NEW.original_source_detail IS DISTINCT FROM OLD.original_source_detail
     OR NEW.original_campaign_context IS DISTINCT FROM OLD.original_campaign_context OR NEW.attribution_contract_version IS DISTINCT FROM OLD.attribution_contract_version
     OR NEW.intake_channel IS DISTINCT FROM OLD.intake_channel OR (OLD.received_at IS NOT NULL AND NEW.received_at IS DISTINCT FROM OLD.received_at) THEN
    RAISE EXCEPTION 'original lead attribution is immutable' USING ERRCODE='23514';
  END IF; RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER leads_p1a_contract_immutable BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION p1a_protect_lead_contract();--> statement-breakpoint
CREATE FUNCTION p1a_validate_committed_intake() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_lead leads%ROWTYPE;
BEGIN
  IF NEW.state='committed' THEN SELECT * INTO linked_lead FROM leads WHERE workspace_id=NEW.workspace_id AND id=NEW.lead_id;
    IF NOT FOUND OR linked_lead.original_source_category IS DISTINCT FROM NEW.source_category OR linked_lead.original_source_platform IS DISTINCT FROM NEW.source_platform
       OR linked_lead.original_source_medium IS DISTINCT FROM NEW.source_medium OR linked_lead.original_source_detail IS DISTINCT FROM NEW.source_detail
       OR linked_lead.original_campaign_context IS DISTINCT FROM NEW.campaign_context OR linked_lead.attribution_contract_version IS DISTINCT FROM NEW.attribution_contract_version
       OR linked_lead.intake_channel IS DISTINCT FROM NEW.intake_channel OR linked_lead.lifecycle_definition_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid THEN
      RAISE EXCEPTION 'committed intake must match immutable P1A lead contract' USING ERRCODE='23514'; END IF;
  END IF; RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER lead_intakes_committed_contract_check BEFORE INSERT OR UPDATE ON lead_intakes FOR EACH ROW EXECUTE FUNCTION p1a_validate_committed_intake();--> statement-breakpoint
CREATE FUNCTION p1a_validate_review_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT EXISTS (SELECT 1 FROM lead_intakes WHERE workspace_id=NEW.workspace_id AND id=NEW.intake_id AND lead_id=NEW.lead_id AND state='committed') THEN
  RAISE EXCEPTION 'review must match one committed intake lead' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;--> statement-breakpoint
CREATE TRIGGER lead_identity_reviews_lineage_check BEFORE INSERT OR UPDATE OF workspace_id,intake_id,lead_id ON lead_identity_reviews FOR EACH ROW EXECUTE FUNCTION p1a_validate_review_lineage();--> statement-breakpoint
CREATE FUNCTION p1a_validate_decision_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate_target uuid; candidate_version integer; current_target_version integer; current_lead_version integer; current_review_version integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lead_identity_reviews r JOIN lead_intakes i ON i.workspace_id=r.workspace_id AND i.id=r.intake_id WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.review_id AND r.intake_id=NEW.intake_id AND i.version=NEW.expected_intake_version) THEN RAISE EXCEPTION 'decision review/intake lineage or expected intake version mismatch' USING ERRCODE='23514'; END IF;
  SELECT l.version,r.version INTO current_lead_version,current_review_version FROM lead_identity_reviews r JOIN leads l ON l.workspace_id=r.workspace_id AND l.id=r.lead_id WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.review_id;
  IF current_lead_version IS DISTINCT FROM NEW.expected_lead_version OR current_review_version IS DISTINCT FROM NEW.expected_review_version THEN RAISE EXCEPTION 'stale Lead or review version' USING ERRCODE='23514'; END IF;
  IF NEW.supersedes_decision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lead_identity_decisions WHERE workspace_id=NEW.workspace_id AND intake_id=NEW.intake_id AND id=NEW.supersedes_decision_id) THEN RAISE EXCEPTION 'invalid decision supersession' USING ERRCODE='23514'; END IF;
  IF NEW.contact_action='link' THEN SELECT contact_id,target_version INTO candidate_target,candidate_version FROM lead_identity_candidates WHERE workspace_id=NEW.workspace_id AND review_id=NEW.review_id AND id=NEW.contact_candidate_id; SELECT version INTO current_target_version FROM contacts WHERE workspace_id=NEW.workspace_id AND id=NEW.contact_id; IF candidate_target IS DISTINCT FROM NEW.contact_id OR candidate_version IS DISTINCT FROM NEW.contact_target_version OR current_target_version IS DISTINCT FROM NEW.contact_target_version THEN RAISE EXCEPTION 'stale or mismatched Contact candidate' USING ERRCODE='23514'; END IF; END IF;
  IF NEW.company_action='link' THEN SELECT company_id,target_version INTO candidate_target,candidate_version FROM lead_identity_candidates WHERE workspace_id=NEW.workspace_id AND review_id=NEW.review_id AND id=NEW.company_candidate_id; SELECT version INTO current_target_version FROM companies WHERE workspace_id=NEW.workspace_id AND id=NEW.company_id; IF candidate_target IS DISTINCT FROM NEW.company_id OR candidate_version IS DISTINCT FROM NEW.company_target_version OR current_target_version IS DISTINCT FROM NEW.company_target_version THEN RAISE EXCEPTION 'stale or mismatched Company candidate' USING ERRCODE='23514'; END IF; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER lead_identity_decisions_lineage_check BEFORE INSERT ON lead_identity_decisions FOR EACH ROW EXECUTE FUNCTION p1a_validate_decision_lineage();--> statement-breakpoint
CREATE FUNCTION p1a_validate_decision_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior uuid;
BEGIN SELECT supersedes_decision_id INTO prior FROM lead_identity_decisions WHERE workspace_id=NEW.workspace_id AND intake_id=NEW.intake_id AND id=NEW.decision_id;
  IF NOT FOUND OR (TG_OP='INSERT' AND prior IS NOT NULL) OR (TG_OP='UPDATE' AND (prior IS DISTINCT FROM OLD.decision_id OR NEW.version<>OLD.version+1)) THEN RAISE EXCEPTION 'effective decision head requires contiguous immutable supersession' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER lead_identity_decision_heads_lineage_check BEFORE INSERT OR UPDATE ON lead_identity_decision_heads FOR EACH ROW EXECUTE FUNCTION p1a_validate_decision_head();--> statement-breakpoint
CREATE FUNCTION p1a_validate_review_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='resolved' AND NEW.state IS DISTINCT FROM 'resolved' THEN RAISE EXCEPTION 'resolved review cannot reopen' USING ERRCODE='23514'; END IF;
  IF OLD.state='pending' AND NEW.state='resolved' AND NOT EXISTS (
    SELECT 1 FROM lead_identity_decision_heads h JOIN lead_identity_decisions d ON d.workspace_id=h.workspace_id AND d.intake_id=h.intake_id AND d.id=h.decision_id
    WHERE h.workspace_id=NEW.workspace_id AND h.intake_id=NEW.intake_id AND d.review_id=NEW.id AND d.governing_outcome='resolve'
      AND d.result_review_version=NEW.version AND d.result_lead_version=(SELECT version FROM leads WHERE workspace_id=NEW.workspace_id AND id=NEW.lead_id)
      AND d.actor_membership_id=NEW.resolved_by_membership_id
  ) THEN RAISE EXCEPTION 'review resolution requires effective complete resolve decision' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER lead_identity_reviews_transition_check BEFORE UPDATE OF state,version,resolved_at,resolved_by_membership_id ON lead_identity_reviews FOR EACH ROW EXECUTE FUNCTION p1a_validate_review_transition();--> statement-breakpoint
CREATE FUNCTION p1a_protect_committed_intake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.state='committed' AND (NEW.workspace_id,NEW.operation,NEW.intake_channel,NEW.idempotency_key,NEW.actor_membership_id,NEW.request_hash,NEW.contract_version,NEW.normalization_version,NEW.attribution_contract_version,NEW.source_category,NEW.source_platform,NEW.source_medium,NEW.source_detail,NEW.campaign_context,NEW.state,NEW.lead_id,NEW.outcome) IS DISTINCT FROM (OLD.workspace_id,OLD.operation,OLD.intake_channel,OLD.idempotency_key,OLD.actor_membership_id,OLD.request_hash,OLD.contract_version,OLD.normalization_version,OLD.attribution_contract_version,OLD.source_category,OLD.source_platform,OLD.source_medium,OLD.source_detail,OLD.campaign_context,OLD.state,OLD.lead_id,OLD.outcome) THEN RAISE EXCEPTION 'committed intake authority is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;--> statement-breakpoint
CREATE TRIGGER lead_intakes_committed_immutable BEFORE UPDATE ON lead_intakes FOR EACH ROW EXECUTE FUNCTION p1a_protect_committed_intake();--> statement-breakpoint
CREATE FUNCTION p1a_reject_lineage_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'P1A lineage is append-only' USING ERRCODE='23514'; END $$;--> statement-breakpoint
CREATE TRIGGER lead_identity_candidates_append_only BEFORE UPDATE OR DELETE ON lead_identity_candidates FOR EACH ROW EXECUTE FUNCTION p1a_reject_lineage_mutation();--> statement-breakpoint
CREATE TRIGGER lead_identity_decisions_append_only BEFORE UPDATE OR DELETE ON lead_identity_decisions FOR EACH ROW EXECUTE FUNCTION p1a_reject_lineage_mutation();
