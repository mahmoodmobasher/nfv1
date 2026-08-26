CREATE TABLE "activity_record_references" (
	"workspace_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_record_references_pk" PRIMARY KEY("workspace_id","activity_id"),
	CONSTRAINT "activity_record_references_type_check" CHECK ("activity_record_references"."record_type"='lead')
);
--> statement-breakpoint
CREATE TABLE "activity_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"kind" text NOT NULL,
	"direction" text,
	"outcome" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer,
	"subject" text NOT NULL,
	"details" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_records_origin_check" CHECK ("activity_records"."origin"='manual'),
	CONSTRAINT "activity_records_kind_check" CHECK ("activity_records"."kind" in ('note','call','meeting','email','message','other')),
	CONSTRAINT "activity_records_direction_check" CHECK ("activity_records"."direction" is null or "activity_records"."direction" in ('inbound','outbound','internal')),
	CONSTRAINT "activity_records_outcome_check" CHECK ("activity_records"."outcome" is null or "activity_records"."outcome" in ('completed','connected','no_answer','left_message','rescheduled','cancelled','follow_up_required','other')),
	CONSTRAINT "activity_records_duration_check" CHECK ("activity_records"."duration_minutes" is null or "activity_records"."duration_minutes" between 1 and 1440),
	CONSTRAINT "activity_records_subject_check" CHECK (length(btrim("activity_records"."subject")) between 1 and 200),
	CONSTRAINT "activity_records_details_check" CHECK ("activity_records"."details" is null or length(btrim("activity_records"."details")) between 1 and 10000),
	CONSTRAINT "activity_records_version_check" CHECK ("activity_records"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_records_workspace_id_id_uq" ON "activity_records" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "activity_record_references" ADD CONSTRAINT "activity_record_references_activity_fk" FOREIGN KEY ("workspace_id","activity_id") REFERENCES "public"."activity_records"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_workspace_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_record_references_record_lookup_idx" ON "activity_record_references" USING btree ("workspace_id","record_type","record_id","activity_id");--> statement-breakpoint
CREATE INDEX "activity_records_workspace_timeline_idx" ON "activity_records" USING btree ("workspace_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_records_workspace_kind_timeline_idx" ON "activity_records" USING btree ("workspace_id","kind","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);
