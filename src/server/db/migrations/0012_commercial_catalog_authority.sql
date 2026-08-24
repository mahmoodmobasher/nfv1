ALTER TABLE "plan_catalog_entries" ADD COLUMN "currency_code" text;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "billing_unit" text;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "monthly_price_cents" integer;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD COLUMN "annual_monthly_equivalent_price_cents" integer;--> statement-breakpoint
ALTER TABLE "plan_catalog_entries" ADD CONSTRAINT "plan_catalog_pricing_tuple_check" CHECK (num_nonnulls(
        "plan_catalog_entries"."currency_code",
        "plan_catalog_entries"."billing_unit",
        "plan_catalog_entries"."monthly_price_cents",
        "plan_catalog_entries"."annual_monthly_equivalent_price_cents"
      ) = 0 or (
        num_nonnulls(
          "plan_catalog_entries"."currency_code",
          "plan_catalog_entries"."billing_unit",
          "plan_catalog_entries"."monthly_price_cents",
          "plan_catalog_entries"."annual_monthly_equivalent_price_cents"
        ) = 4
        and
        "plan_catalog_entries"."currency_code" ~ '^[A-Z]{3}$'
        and "plan_catalog_entries"."billing_unit" = 'workspace_subscription'
        and "plan_catalog_entries"."monthly_price_cents" > 0
        and "plan_catalog_entries"."annual_monthly_equivalent_price_cents" > 0
      ));--> statement-breakpoint
UPDATE "plan_catalog_entries"
SET
	"status" = 'retired',
	"effective_to" = greatest(
		'2026-08-24T00:00:00Z'::timestamptz,
		"effective_from" + interval '1 microsecond'
	),
	"updated_at" = now()
WHERE "code" IN ('essentials', 'growth', 'scale')
	AND "catalog_version" <> '2026-08-commercial-v1'
	AND "status" = 'active';--> statement-breakpoint
INSERT INTO "plan_catalog_entries" (
	"code",
	"catalog_version",
	"name",
	"status",
	"allowed_cadences",
	"included_active_seats",
	"currency_code",
	"billing_unit",
	"monthly_price_cents",
	"annual_monthly_equivalent_price_cents",
	"feature_flags",
	"trial_days",
	"effective_from"
) VALUES
	('essentials', '2026-08-commercial-v1', 'Essentials', 'active', '["monthly","annual"]', 1, 'USD', 'workspace_subscription', 6999, 2400, '{"crm":true}', 14, '2026-08-24T00:00:00Z'),
	('growth', '2026-08-commercial-v1', 'Growth', 'active', '["monthly","annual"]', 5, 'USD', 'workspace_subscription', 8999, 5700, '{"crm":true,"automation":true}', 14, '2026-08-24T00:00:00Z'),
	('scale', '2026-08-commercial-v1', 'Scale', 'active', '["monthly","annual"]', 15, 'USD', 'workspace_subscription', 11999, 10700, '{"crm":true,"automation":true,"advanced_roles":true}', 14, '2026-08-24T00:00:00Z')
ON CONFLICT ("code", "catalog_version") DO NOTHING;--> statement-breakpoint
DO $$
BEGIN
	IF (
		SELECT count(*)
		FROM "plan_catalog_entries"
		WHERE "catalog_version" = '2026-08-commercial-v1'
			AND "status" = 'active'
			AND "currency_code" = 'USD'
			AND "billing_unit" = 'workspace_subscription'
			AND (
				("code" = 'essentials' AND "included_active_seats" = 1 AND "monthly_price_cents" = 6999 AND "annual_monthly_equivalent_price_cents" = 2400)
				OR ("code" = 'growth' AND "included_active_seats" = 5 AND "monthly_price_cents" = 8999 AND "annual_monthly_equivalent_price_cents" = 5700)
				OR ("code" = 'scale' AND "included_active_seats" = 15 AND "monthly_price_cents" = 11999 AND "annual_monthly_equivalent_price_cents" = 10700)
			)
	) <> 3 THEN
		RAISE EXCEPTION 'commercial catalog 2026-08-commercial-v1 conflicts with Product authority';
	END IF;
END $$;
