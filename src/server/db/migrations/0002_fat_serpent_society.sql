ALTER TABLE "plan_catalog_entries" DROP CONSTRAINT "plan_catalog_entries_code_unique";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_type" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "source_ip" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "source_ip_policy" text DEFAULT 'omitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "user_agent_sanitized" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "before" jsonb;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "after" jsonb;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "metadata_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "catalog_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "effective_from" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "effective_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ALTER COLUMN "catalog_version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ALTER COLUMN "effective_from" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_workspace_id_id_uq" ON "workspace_memberships" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_actor_workspace_membership_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_workspace_idx" ON "outbox_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_catalog_code_version_uq" ON "plan_catalog_entries" USING btree ("code","catalog_version");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_actor_type_check" CHECK ("audit_events"."actor_type" in ('user', 'system', 'support'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_outcome_check" CHECK ("audit_events"."outcome" in ('success', 'denied', 'failure'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_actor_membership_scope_check" CHECK ("audit_events"."actor_membership_id" is null or "audit_events"."workspace_id" is not null);--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_source_ip_policy_check" CHECK ("audit_events"."source_ip_policy" in ('omitted', 'truncated', 'hashed'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_source_ip_presence_check" CHECK (("audit_events"."source_ip_policy" = 'omitted' and "audit_events"."source_ip" is null) or ("audit_events"."source_ip_policy" <> 'omitted' and "audit_events"."source_ip" is not null));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_user_agent_sanitized_check" CHECK ("audit_events"."user_agent_sanitized" is null or (length("audit_events"."user_agent_sanitized") <= 512 and "audit_events"."user_agent_sanitized" !~ '[[:cntrl:]]'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_before_safe_shape_check" CHECK ("audit_events"."before" is null or jsonb_typeof("audit_events"."before") in ('object', 'array'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_after_safe_shape_check" CHECK ("audit_events"."after" is null or jsonb_typeof("audit_events"."after") in ('object', 'array'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_metadata_version_check" CHECK ("audit_events"."metadata_version" > 0);--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_metadata_allowlist_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and ("audit_events"."metadata" - array['risk_bucket', 'change_fields', 'provider', 'auth_method', 'policy_version', 'operation']::text[]) = '{}'::jsonb);--> statement-breakpoint
ALTER TABLE "identity_credentials" ADD CONSTRAINT "identity_credentials_provider_check" CHECK ("identity_credentials"."provider" in ('password', 'google'));--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_billing_cadence_check" CHECK ("onboarding_progress"."billing_cadence" is null or "onboarding_progress"."billing_cadence" in ('monthly', 'annual', 'sales_managed'));--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_current_step_check" CHECK ("onboarding_progress"."current_step" in ('account', 'identity_verification', 'workspace', 'complete'));--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_version_check" CHECK ("onboarding_progress"."version" > 0);--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_status_check" CHECK ("outbox_messages"."status" in ('pending', 'processing', 'retry', 'delivered', 'dead_letter'));--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_attempts_check" CHECK ("outbox_messages"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_status_check" CHECK ("plan_catalog_entries"."status" in ('draft', 'active', 'retired'));--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_seats_check" CHECK ("plan_catalog_entries"."included_active_seats" > 0);--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_trial_days_check" CHECK ("plan_catalog_entries"."trial_days" >= 0);--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_effective_dates_check" CHECK ("plan_catalog_entries"."effective_to" is null or "plan_catalog_entries"."effective_to" > "plan_catalog_entries"."effective_from");--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_allowed_cadences_check" CHECK (jsonb_typeof("plan_catalog_entries"."allowed_cadences") = 'array' and "plan_catalog_entries"."allowed_cadences" <@ '["monthly", "annual", "sales_managed"]'::jsonb);--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_code_check" CHECK ("roles"."code" in ('owner', 'admin', 'member'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('pending_verification', 'active', 'suspended', 'deleted'));--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_status_check" CHECK ("workspace_memberships"."status" in ('active', 'suspended', 'removed'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_status_check" CHECK ("workspaces"."status" in ('provisioning', 'active', 'suspended', 'closed'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_billing_cadence_check" CHECK ("workspaces"."billing_cadence" in ('monthly', 'annual', 'sales_managed'));
