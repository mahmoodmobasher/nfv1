CREATE TABLE "oidc_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"pkce_verifier_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"linking_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_transactions_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "oidc_transaction_redirect_check" CHECK ("oidc_transactions"."redirect_uri" = 'http://127.0.0.1:3000/api/auth/oidc/callback')
);
--> statement-breakpoint
ALTER TABLE "oidc_transactions" ADD CONSTRAINT "oidc_transactions_linking_user_id_users_id_fk" FOREIGN KEY ("linking_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "plan_catalog_entries" ("code","catalog_version","name","status","allowed_cadences","included_active_seats","feature_flags","trial_days","effective_from") VALUES
('essentials','2026-08','Essentials','active','["monthly","annual"]',1,'{"crm":true}',14,'2026-08-01T00:00:00Z'),
('growth','2026-08','Growth','active','["monthly","annual"]',5,'{"crm":true,"automation":true}',14,'2026-08-01T00:00:00Z'),
('scale','2026-08','Scale','active','["monthly","annual"]',15,'{"crm":true,"automation":true,"advanced_roles":true}',14,'2026-08-01T00:00:00Z')
ON CONFLICT ("code","catalog_version") DO NOTHING;
