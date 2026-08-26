import { contactInternalNoteErrorV1Schema } from "../contracts/contact-note.contract";
import type { ContactInternalNoteListQueryV1 } from "../contracts/contact-note.contract";

export const contactNoteHeaders = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };
const registry = {
  authentication_required: [401, false, "clear_protected_state", "Authentication is required."],
  permission_required: [403, false, "clear_protected_state", "This action is not available."],
  resource_not_found: [404, false, "clear_protected_state", "The requested resource is unavailable."],
  validation_failed: [400, false, "none", "The request is invalid."],
  unsupported_contract_version: [400, false, "none", "The contract version is not supported."],
  stale_version: [409, false, "refetch_contact", "The Contact changed. Refresh it before adding the note."],
  idempotency_conflict: [409, false, "new_request", "The idempotency key conflicts with a prior request."],
  notes_unavailable: [503, true, "retry_same_request", "Internal notes are temporarily unavailable."],
  unexpected_error: [500, true, "retry_same_request", "The request could not be completed."],
} as const;
type Code = keyof typeof registry;

export function contactNoteFailure(error: unknown, requestId: string) {
  const candidate = error as { code?: string; status?: number }, code: Code =
    candidate?.code && candidate.code in registry ? candidate.code as Code : "unexpected_error",
    entry = registry[code], valid = candidate?.status === entry[0], owned = valid ? code : "unexpected_error",
    selected = registry[owned];
  return Response.json(contactInternalNoteErrorV1Schema.parse({
    error: { code: owned, message: selected[3], retryable: selected[1],
      reconciliation: { required: selected[2] !== "none", action: selected[2] }, zeroPartialEffects: true },
    requestId,
  }), { status: selected[0], headers: contactNoteHeaders });
}

export function contactNoteJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: contactNoteHeaders });
}

export function parseContactNoteListSearchParams(params: URLSearchParams): ContactInternalNoteListQueryV1 {
  const allowed = new Set(["cursor", "limit"]);
  for (const key of params.keys())
    if (!allowed.has(key) || params.getAll(key).length !== 1)
      throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400 });
  return {
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") === null ? undefined : Number(params.get("limit")),
  } as ContactInternalNoteListQueryV1;
}
