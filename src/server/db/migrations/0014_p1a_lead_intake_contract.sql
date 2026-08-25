DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM p1a_migration_checkpoints WHERE migration_key='p1a-0013-leads' AND completed_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM leads WHERE display_name IS NULL OR person_name_normalized IS NULL OR original_source_category IS NULL OR received_at IS NULL)
     OR EXISTS (SELECT 1 FROM leads WHERE workspace_id IS NULL OR status NOT IN ('open','won','lost')) THEN
    RAISE EXCEPTION 'P1A Lead backfill checkpoint or retained-data validation incomplete';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_display_name_nn" CHECK (display_name IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_name_normalized_nn" CHECK (person_name_normalized IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_original_source_category_nn" CHECK (original_source_category IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_received_at_nn" CHECK (received_at IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leads" VALIDATE CONSTRAINT "leads_display_name_nn";--> statement-breakpoint
ALTER TABLE "leads" VALIDATE CONSTRAINT "leads_person_name_normalized_nn";--> statement-breakpoint
ALTER TABLE "leads" VALIDATE CONSTRAINT "leads_original_source_category_nn";--> statement-breakpoint
ALTER TABLE "leads" VALIDATE CONSTRAINT "leads_received_at_nn";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "person_name_normalized" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "original_source_category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "received_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_name_check" CHECK (length(btrim("leads"."display_name")) between 1 and 200 and ("leads"."first_name" is null or length(btrim("leads"."first_name")) between 1 and 100) and ("leads"."last_name" is null or length(btrim("leads"."last_name")) between 1 and 100));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_normalized_name_check" CHECK (length("leads"."person_name_normalized") between 1 and 200 and "leads"."person_name_normalized"=btrim("leads"."person_name_normalized"));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_original_source_check" CHECK ("leads"."original_source_category" in ('website','referral','outbound','event','partner','social_media','import','manual','other'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_social_platform_check" CHECK (coalesce(("leads"."original_source_category"='social_media' and "leads"."original_source_platform" in ('tiktok','instagram','facebook','linkedin','x','youtube','other_social') and ("leads"."original_source_platform"<>'other_social' or length(btrim(coalesce("leads"."original_source_detail"->>'platform_context',''))) between 1 and 200)) or ("leads"."original_source_category"<>'social_media' and "leads"."original_source_platform" is null),false));
