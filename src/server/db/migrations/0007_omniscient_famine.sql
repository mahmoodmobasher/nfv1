CREATE TABLE "team_memberships" (
	"workspace_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"workspace_membership_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_pk" PRIMARY KEY("team_id","workspace_membership_id"),
	CONSTRAINT "team_memberships_version_check" CHECK ("team_memberships"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_status_check" CHECK ("teams"."status" in ('active', 'archived')),
	CONSTRAINT "teams_version_check" CHECK ("teams"."version" > 0),
	CONSTRAINT "teams_name_check" CHECK (length(btrim("teams"."name")) between 1 and 100 and "teams"."name_normalized"=lower(btrim("teams"."name_normalized")))
);
--> statement-breakpoint
CREATE TABLE "workspace_invitation_teams" (
	"workspace_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitation_teams_pk" PRIMARY KEY("invitation_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"email_display" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"token_generation" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"accepted_membership_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_membership_id" uuid,
	"invited_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "workspace_invitations_status_check" CHECK ("workspace_invitations"."status" in ('pending','accepted','revoked','expired','superseded')),
	CONSTRAINT "workspace_invitations_email_check" CHECK (length("workspace_invitations"."email_normalized") between 3 and 320 and "workspace_invitations"."email_normalized"=lower(btrim("workspace_invitations"."email_normalized"))),
	CONSTRAINT "workspace_invitations_generation_check" CHECK ("workspace_invitations"."token_generation">0 and "workspace_invitations"."version">0),
	CONSTRAINT "workspace_invitations_expiry_check" CHECK ("workspace_invitations"."expires_at">"workspace_invitations"."created_at"),
	CONSTRAINT "workspace_invitations_terminal_check" CHECK (("workspace_invitations"."status"='accepted' and "workspace_invitations"."accepted_at" is not null and "workspace_invitations"."accepted_by_user_id" is not null and "workspace_invitations"."accepted_membership_id" is not null and "workspace_invitations"."revoked_at" is null and "workspace_invitations"."revoked_by_membership_id" is null) or ("workspace_invitations"."status"='revoked' and "workspace_invitations"."revoked_at" is not null and "workspace_invitations"."revoked_by_membership_id" is not null and "workspace_invitations"."accepted_at" is null and "workspace_invitations"."accepted_by_user_id" is null and "workspace_invitations"."accepted_membership_id" is null) or ("workspace_invitations"."status" in ('pending','expired','superseded') and "workspace_invitations"."accepted_at" is null and "workspace_invitations"."accepted_by_user_id" is null and "workspace_invitations"."accepted_membership_id" is null and ("workspace_invitations"."status"<>'pending' or ("workspace_invitations"."revoked_at" is null and "workspace_invitations"."revoked_by_membership_id" is null))))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_metadata_allowlist_check";--> statement-breakpoint
ALTER TABLE "rate_limit_windows" DROP CONSTRAINT "rate_limit_action_check";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "policy_version" text DEFAULT 'tenant-admin-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "authenticated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_method" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
UPDATE "sessions" SET "authenticated_at"="created_at", "auth_method"='legacy';--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
INSERT INTO "roles" ("workspace_id","code","permissions","is_system","policy_version")
SELECT w.id, p.code, p.permissions, true, 'tenant-admin-v1'
FROM "workspaces" w CROSS JOIN (VALUES
 ('owner','{"version":"tenant-admin-v1","permissions":["workspace.settings.read","workspace.settings.write","members.read","members.invite_member","members.invite_admin","members.manage_member","members.manage_admin","members.transfer_owner","roles.policy.write","teams.read","teams.write"]}'::jsonb),
 ('admin','{"version":"tenant-admin-v1","permissions":["workspace.settings.read","members.read","members.invite_member","members.manage_member","teams.read","teams.write"]}'::jsonb),
 ('member','{"version":"tenant-admin-v1","permissions":[]}'::jsonb)
) p(code,permissions)
ON CONFLICT (workspace_id,code) DO NOTHING;--> statement-breakpoint
UPDATE "roles" SET "permissions"='{"version":"tenant-admin-v1","permissions":["workspace.settings.read","workspace.settings.write","members.read","members.invite_member","members.invite_admin","members.manage_member","members.manage_admin","members.transfer_owner","roles.policy.write","teams.read","teams.write"]}'::jsonb,"policy_version"='tenant-admin-v1',"updated_at"=now()
WHERE "code"='owner' AND (jsonb_typeof("permissions")<>'object' OR jsonb_typeof("permissions"->'permissions')<>'array');--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_id_id_uq" ON "teams" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_workspace_id_id_uq" ON "workspace_invitations" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_workspace_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_workspace_member_fk" FOREIGN KEY ("workspace_id","workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_teams" ADD CONSTRAINT "workspace_invitation_teams_invitation_fk" FOREIGN KEY ("workspace_id","invitation_id") REFERENCES "public"."workspace_invitations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_teams" ADD CONSTRAINT "workspace_invitation_teams_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_role_fk" FOREIGN KEY ("workspace_id","role_id") REFERENCES "public"."roles"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_inviter_fk" FOREIGN KEY ("workspace_id","invited_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_revoker_fk" FOREIGN KEY ("workspace_id","revoked_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_membership_fk" FOREIGN KEY ("workspace_id","accepted_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_workspace_uq" ON "team_memberships" USING btree ("workspace_id","team_id","workspace_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_name_uq" ON "teams" USING btree ("workspace_id","name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_teams_workspace_uq" ON "workspace_invitation_teams" USING btree ("workspace_id","invitation_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_pending_email_uq" ON "workspace_invitations" USING btree ("workspace_id","email_normalized") WHERE "workspace_invitations"."status"='pending';--> statement-breakpoint
CREATE INDEX "workspace_invitations_status_idx" ON "workspace_invitations" USING btree ("workspace_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations" USING btree ("workspace_id","email_normalized");--> statement-breakpoint
CREATE INDEX "workspace_invitations_expiry_idx" ON "workspace_invitations" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_metadata_allowlist_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and ("audit_events"."metadata" - array['risk_bucket', 'change_fields', 'provider', 'auth_method', 'policy_version', 'operation', 'invitation_generation', 'assigned_role', 'team_count', 'expected_version', 'result_version', 'seat_limit', 'active_seats', 'auth_age_bucket']::text[]) = '{}'::jsonb);--> statement-breakpoint
ALTER TABLE "rate_limit_windows" ADD CONSTRAINT "rate_limit_action_check" CHECK ("rate_limit_windows"."action" in ('register', 'login', 'verify', 'verification_resend', 'reset_request', 'reset_complete', 'invite_create', 'invite_resend', 'invite_accept', 'invite_revoke', 'member_change', 'team_change', 'recent_auth'));--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_version_check" CHECK ("roles"."version" > 0);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_auth_method_check" CHECK ("sessions"."auth_method" in ('password', 'google', 'fixture', 'legacy'));--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_version_check" CHECK ("workspace_memberships"."version" > 0);--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_version_check" CHECK ("workspaces"."version" > 0);
