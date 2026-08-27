LOCK TABLE leads IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE source='social_media' LIMIT 1) THEN
    RAISE EXCEPTION USING
      ERRCODE='P0001',
      MESSAGE='db_01b_current_social_platform_required';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_platform" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_current_source_platform_check" CHECK (coalesce(("leads"."source"='social_media' and "leads"."source_platform" in ('tiktok','instagram','facebook','linkedin','x','youtube','other_social')) or ("leads"."source"<>'social_media' and "leads"."source_platform" is null),false));
