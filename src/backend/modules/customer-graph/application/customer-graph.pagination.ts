import { CustomerGraphError } from "../contracts/customer-graph.contract";

export type CustomerGraphKind = "company" | "contact";

export function decodeCustomerGraphCursor(
  value: string | undefined,
  kind: CustomerGraphKind,
  status: string,
) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      v: number;
      k: string;
      s: string;
      u: string;
      i: string;
    };
    if (
      parsed.v !== 1 ||
      parsed.k !== kind ||
      parsed.s !== status ||
      !Number.isFinite(Date.parse(parsed.u)) ||
      !/^[0-9a-f-]{36}$/i.test(parsed.i)
    )
      throw new Error("invalid cursor");
    return parsed;
  } catch {
    throw new CustomerGraphError("validation_failed", 400);
  }
}

export function encodeCustomerGraphCursor(
  kind: CustomerGraphKind,
  status: string,
  row: { updatedAt: string; id: string },
) {
  return Buffer.from(
    JSON.stringify({ v: 1, k: kind, s: status, u: row.updatedAt, i: row.id }),
  ).toString("base64url");
}
