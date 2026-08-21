CREATE TABLE "identity_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "identity_tokens_purpose_check" CHECK ("identity_tokens"."purpose" in ('email_verification', 'password_reset')),
	CONSTRAINT "identity_tokens_terminal_state_check" CHECK ("identity_tokens"."consumed_at" is null or "identity_tokens"."replaced_at" is null)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"risk_key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_action_check" CHECK ("rate_limit_windows"."action" in ('register', 'login', 'verify', 'verification_resend', 'reset_request', 'reset_complete')),
	CONSTRAINT "rate_limit_attempts_check" CHECK ("rate_limit_windows"."attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "identity_credentials" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "security_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_tokens_user_purpose_idx" ON "identity_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_action_key_window_uq" ON "rate_limit_windows" USING btree ("action","risk_key_hash","window_started_at");