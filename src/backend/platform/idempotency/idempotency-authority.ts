import { createHash } from "node:crypto";
import type { ModuleTransaction } from "../database";

export type LeadMutationOperation = "lead-operational-edit.v1" | "lead-stage-transition.v1";

export type IdempotencyReceipt<T = unknown> = {
  id: string;
  requestHash: string;
  outcome: T;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalRequestHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export async function lockIdempotencyAuthority(tx: ModuleTransaction, scope: string): Promise<void> {
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [scope]);
}

export async function lockIdentityKeyAuthority(tx: ModuleTransaction, scope: string): Promise<void> {
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1,7102))", [scope]);
}

export function idempotencyReceiptParticipant(tx: ModuleTransaction) {
  return {
    async find<T>(principalKey: string, operation: LeadMutationOperation,
      idempotencyKey: string): Promise<IdempotencyReceipt<T> | null> {
      const row = (await tx.query<{ id: string; request_hash: string; outcome: T }>(
        `select id,request_hash,outcome from idempotency_records
          where principal_key=$1 and operation=$2 and idempotency_key=$3 and expires_at>now()`,
        [principalKey, operation, idempotencyKey],
      )).rows[0];
      return row ? { id: row.id, requestHash: row.request_hash, outcome: row.outcome } : null;
    },
    async save<T>(input: { principalKey: string; operation: LeadMutationOperation; idempotencyKey: string;
      requestHash: string; outcome: T }): Promise<string> {
      await tx.query(
        `delete from idempotency_records where principal_key=$1 and operation=$2 and idempotency_key=$3 and expires_at<=now()`,
        [input.principalKey, input.operation, input.idempotencyKey],
      );
      const row = (await tx.query<{ id: string }>(
        `insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,outcome,expires_at)
         values($1,$2,$3,$4,$5,now()+interval '24 hours')
         returning id`,
        [input.principalKey, input.operation, input.idempotencyKey, input.requestHash, JSON.stringify(input.outcome)],
      )).rows[0];
      if (!row) throw new Error("idempotency_receipt_unavailable");
      return row.id;
    },
  };
}
