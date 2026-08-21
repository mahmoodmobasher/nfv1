ALTER TABLE "outbox_messages" ADD COLUMN "provider_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "lease_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_provider_idempotency_key_unique" UNIQUE("provider_idempotency_key");--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_lease_generation_check" CHECK ("outbox_messages"."lease_generation" >= 0);