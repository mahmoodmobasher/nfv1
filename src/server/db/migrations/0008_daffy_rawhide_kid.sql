CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_kind_check" CHECK ("lead_activities"."kind" in ('note', 'created', 'updated', 'stage_changed', 'status_changed')),
	CONSTRAINT "lead_activities_body_check" CHECK (length(btrim("lead_activities"."body")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "lead_visible_teams" (
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_visible_teams_pk" PRIMARY KEY("lead_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email_normalized" text NOT NULL,
	"email_display" text NOT NULL,
	"company" text NOT NULL,
	"phone" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"stage_id" uuid NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"visibility" text DEFAULT 'workspace' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "leads_name_check" CHECK (length(btrim("leads"."first_name")) between 1 and 100 and length(btrim("leads"."last_name")) between 1 and 100),
	CONSTRAINT "leads_email_check" CHECK (length("leads"."email_normalized") between 3 and 320 and "leads"."email_normalized"=lower(btrim("leads"."email_normalized"))),
	CONSTRAINT "leads_company_check" CHECK (length(btrim("leads"."company")) between 1 and 160),
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('website', 'referral', 'event', 'partner', 'other')),
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('open', 'won', 'lost')),
	CONSTRAINT "leads_visibility_check" CHECK ("leads"."visibility" in ('workspace', 'teams')),
	CONSTRAINT "leads_version_check" CHECK ("leads"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stages_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "pipeline_stages_name_check" CHECK (length(btrim("pipeline_stages"."name")) between 1 and 80),
	CONSTRAINT "pipeline_stages_position_check" CHECK ("pipeline_stages"."position" >= 0),
	CONSTRAINT "pipeline_stages_status_check" CHECK ("pipeline_stages"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_visible_teams" ADD CONSTRAINT "lead_visible_teams_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_visible_teams" ADD CONSTRAINT "lead_visible_teams_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_stage_fk" FOREIGN KEY ("workspace_id","stage_id") REFERENCES "public"."pipeline_stages"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_owner_fk" FOREIGN KEY ("workspace_id","owner_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("workspace_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_updated_idx" ON "leads" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "leads_workspace_email_idx" ON "leads" USING btree ("workspace_id","email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_workspace_position_uq" ON "pipeline_stages" USING btree ("workspace_id","position");
--> statement-breakpoint
INSERT INTO "pipeline_stages" ("workspace_id", "name", "position")
SELECT w.id, s.name, s.position
FROM "workspaces" w
CROSS JOIN (VALUES ('New', 0), ('Contacted', 1), ('Qualified', 2), ('Proposal', 3)) AS s(name, position)
ON CONFLICT ("workspace_id", "position") DO NOTHING;
