import type { Pool } from "pg";
import type { EmailAdapter } from "./adapter";
import { decryptEnvelope } from "../security/crypto";

type EmailEnvelope = { to: string; subject: string; text: string };
export type OutboxClaim = { id: string; payload: { envelope: string }; attempts: number; lease_owner: string; lease_generation: number; provider_idempotency_key: string };

export async function claimOutbox(database: Pool, workerId: string, leaseSeconds = 30) {
  const client = await database.connect();
  try {
    await client.query("begin");
    const result = await client.query<OutboxClaim>(
      `with candidate as (
         select id from outbox_messages
          where topic in ('identity.email_verification','identity.password_reset','workspace.invitation_email_requested') and available_at <= now() and (
            (status in ('pending', 'retry') and (lease_until is null or lease_until < now()))
            or (status = 'processing' and lease_until < now())
          )
          order by available_at, created_at for update skip locked limit 1
       )
       update outbox_messages o set status = 'processing', lease_until = now() + ($1 * interval '1 second'),
         lease_owner = $2, lease_generation = o.lease_generation + 1,
         provider_idempotency_key = coalesce(o.provider_idempotency_key, o.id::text), last_error = null, updated_at = now()
       from candidate where o.id = candidate.id returning o.id, o.payload, o.attempts, o.lease_owner, o.lease_generation, o.provider_idempotency_key`,
      [leaseSeconds, workerId],
    );
    await client.query("commit");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeOutboxSuccess(database: Pool, claim: OutboxClaim, messageId: string): Promise<boolean> {
  const result = await database.query(
    `update outbox_messages set status = 'delivered', provider_message_id = $4, lease_until = null, lease_owner = null, updated_at = now()
      where id = $1 and status = 'processing' and lease_owner = $2 and lease_generation = $3`,
    [claim.id, claim.lease_owner, claim.lease_generation, messageId],
  );
  return result.rowCount === 1;
}

function safeDeliveryError(error: unknown): string {
  if (error instanceof Error && /timeout/i.test(error.message)) return "delivery_timeout";
  if (error instanceof Error && /reject|denied|invalid recipient/i.test(error.message)) return "delivery_rejected";
  return "delivery_unavailable";
}

export async function finalizeOutboxFailure(database: Pool, claim: OutboxClaim, error: unknown): Promise<boolean> {
  const attempts = claim.attempts + 1;
  const state = attempts >= 5 ? "dead_letter" : "retry";
  const result = await database.query(
    `update outbox_messages set status = $4, attempts = $5, available_at = now() + interval '1 second',
      lease_until = null, lease_owner = null, last_error = $6, updated_at = now()
      where id = $1 and status = 'processing' and lease_owner = $2 and lease_generation = $3`,
    [claim.id, claim.lease_owner, claim.lease_generation, state, attempts, safeDeliveryError(error)],
  );
  return result.rowCount === 1;
}

export async function processOneOutbox(database: Pool, adapter: EmailAdapter, secret: string, workerId: string): Promise<boolean> {
  const message = await claimOutbox(database, workerId);
  if (!message) return false;
  try {
    const email = decryptEnvelope<EmailEnvelope>(message.payload.envelope, secret);
    const result = await adapter.send({ ...email, idempotencyKey: message.provider_idempotency_key });
    await finalizeOutboxSuccess(database, message, result.messageId);
  } catch (error) {
    await finalizeOutboxFailure(database, message, error);
  }
  return true;
}
