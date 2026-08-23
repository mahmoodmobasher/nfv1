CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"appearance" text DEFAULT 'system' NOT NULL,
	"locale" text,
	"time_zone" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_appearance_check" CHECK ("user_preferences"."appearance" in ('system', 'light', 'dark')),
	CONSTRAINT "user_preferences_locale_check" CHECK ("user_preferences"."locale" is null or length(btrim("user_preferences"."locale")) between 2 and 35),
	CONSTRAINT "user_preferences_time_zone_check" CHECK ("user_preferences"."time_zone" is null or length(btrim("user_preferences"."time_zone")) between 1 and 64),
	CONSTRAINT "user_preferences_version_check" CHECK ("user_preferences"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_password_user_uq" ON "identity_credentials" USING btree ("user_id") WHERE "identity_credentials"."provider" = 'password';--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","revoked_at","last_seen_at");