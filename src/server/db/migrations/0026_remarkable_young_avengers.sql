ALTER TABLE "leads" ADD COLUMN "status_source" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lifecycle_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "working_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "disqualification_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "disqualification_note" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lifecycle_reopen_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_source_check" CHECK ("leads"."status_source" in ('system','manual'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_disqualification_reason_check" CHECK ("leads"."disqualification_reason" is null or "leads"."disqualification_reason" in ('not_a_fit','no_response','duplicate','bad_data','no_budget','lost_to_competitor','other'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_disqualification_note_check" CHECK (("leads"."disqualification_note" is null or char_length(btrim("leads"."disqualification_note")) between 1 and 1000) and ("leads"."disqualification_reason" is distinct from 'other' or "leads"."disqualification_note" is not null) and ("leads"."disqualification_reason" is not null or "leads"."disqualification_note" is null));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lifecycle_reopen_count_check" CHECK ("leads"."lifecycle_reopen_count" >= 0);