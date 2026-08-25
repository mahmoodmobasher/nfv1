import { createHash } from "node:crypto";
import type { ModuleTransaction } from "../database";

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
