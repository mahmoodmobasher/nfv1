import { LeadIntakeError } from "../contracts/lead-inquiry-intake.contract";

const privateHeaders = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };

export function leadIntakeJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: privateHeaders });
}

const presentation = {
  authentication_required: ["Authentication is required.", false, "none"],
  permission_required: ["This action is not available.", false, "none"],
  resource_not_found: ["The requested resource is unavailable.", false, "none"],
  validation_failed: ["The request is invalid.", false, "none"],
  unsupported_contract_version: ["The contract version is not supported.", false, "none"],
  source_platform_required: ["The source platform is required.", false, "none"],
  source_platform_not_allowed: ["The source platform is not allowed.", false, "none"],
  invalid_source_category: ["The source category is invalid.", false, "none"],
  invalid_source_platform: ["The source platform is invalid.", false, "none"],
  invalid_source_medium: ["The source medium is invalid.", false, "none"],
  source_detail_too_large: ["The source context is too large.", false, "none"],
  idempotency_conflict: ["The idempotency key conflicts with a prior request.", false, "none"],
  stale_version: ["The identity review has changed.", false, "refetch_identity_review"],
  invalid_match_decision: ["The selected identity is no longer available.", false, "refetch_identity_review"],
  assignment_unavailable: ["The selected responsibility is unavailable.", false, "refetch_identity_review"],
  rate_limited: ["Too many requests. Try again later.", true, "retry_same_request"],
  intake_unavailable: ["Lead intake is temporarily unavailable.", true, "retry_same_request"],
  unexpected_error: ["The request could not be completed.", true, "retry_same_request"],
} as const;

const stableStatus = {
  authentication_required: 401, permission_required: 403, resource_not_found: 404, validation_failed: 400,
  unsupported_contract_version: 400, source_platform_required: 400, source_platform_not_allowed: 400,
  invalid_source_category: 400, invalid_source_platform: 400, invalid_source_medium: 400, source_detail_too_large: 400,
  idempotency_conflict: 409, stale_version: 409, invalid_match_decision: 409, assignment_unavailable: 409,
  rate_limited: 429, intake_unavailable: 503, unexpected_error: 500,
} as const;

export function leadIntakeFailure(error: unknown, requestId: string,
  safeNextView?: { kind: "identity_review_detail"; leadId: string }) {
  const known = error instanceof LeadIntakeError ? error :
    error && typeof error === "object" && "code" in error && "status" in error
      ? new LeadIntakeError((error as { code: never }).code, (error as { status: number }).status)
      : new LeadIntakeError("unexpected_error", 500);
  const approvedStatus = stableStatus[known.code as keyof typeof stableStatus];
  const normalized = approvedStatus === known.status ? known : new LeadIntakeError("unexpected_error", 500);
  const entry = presentation[normalized.code as keyof typeof presentation];
  const action = entry[2];
  const body: Record<string, unknown> = { code: normalized.code, message: entry[0], retryable: entry[1],
    reconciliation: { required: action !== "none", action } };
  if (normalized.safe && normalized.status === 400) body.details = normalized.safe;
  const discloseNext = safeNextView && normalized.status === 409;
  return Response.json({ error: body, requestId, ...(discloseNext ? { nextView: safeNextView } : {}) },
    { status: normalized.status, headers: privateHeaders });
}
