import {
  LeadConversionError,
  type LeadConversionErrorCode,
} from "../contracts/lead-conversion.contract";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "cookie",
};

export function leadConversionJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: privateHeaders });
}

const presentation: Record<
  LeadConversionErrorCode,
  readonly [
    string,
    boolean,
    (
      | "none"
      | "refetch_preview"
      | "new_request"
      | "retry_same_request"
      | "clear_conversion_state"
    ),
    number,
  ]
> = {
  authentication_required: [
    "Authentication is required.",
    false,
    "clear_conversion_state",
    401,
  ],
  permission_required: [
    "Conversion is not available.",
    false,
    "clear_conversion_state",
    403,
  ],
  resource_not_found: [
    "The requested resource is unavailable.",
    false,
    "clear_conversion_state",
    404,
  ],
  validation_failed: ["The request is invalid.", false, "none", 400],
  unsupported_contract_version: [
    "The contract version is not supported.",
    false,
    "none",
    400,
  ],
  stale_preview: [
    "The conversion preview has changed.",
    false,
    "refetch_preview",
    409,
  ],
  identity_review_pending: [
    "Identity Review must be resolved first.",
    false,
    "refetch_preview",
    409,
  ],
  selection_unavailable: [
    "A selected customer is no longer available.",
    false,
    "refetch_preview",
    409,
  ],
  primary_contact_mismatch: [
    "The selected primary Contact does not match the resolved identity review.",
    false,
    "refetch_preview",
    409,
  ],
  already_converted: [
    "This Lead has already been converted.",
    false,
    "refetch_preview",
    409,
  ],
  idempotency_conflict: [
    "The key belongs to a different request.",
    false,
    "new_request",
    409,
  ],
  conversion_unavailable: [
    "Conversion is temporarily unavailable.",
    true,
    "retry_same_request",
    503,
  ],
  unexpected_error: [
    "The conversion could not be completed.",
    true,
    "retry_same_request",
    500,
  ],
};

export function leadConversionFailure(error: unknown, requestId: string) {
  const candidate =
    error instanceof LeadConversionError
      ? error
      : error &&
          typeof error === "object" &&
          "code" in error &&
          "status" in error
        ? new LeadConversionError(
            (error as { code: LeadConversionErrorCode }).code,
            Number((error as { status: number }).status),
          )
        : new LeadConversionError("unexpected_error", 500);
  const known = presentation[candidate.code]
    ? candidate
    : new LeadConversionError("unexpected_error", 500);
  const [message, retryable, action, expectedStatus] = presentation[known.code];
  const normalized =
    known.status === expectedStatus
      ? known
      : new LeadConversionError("unexpected_error", 500);
  const stable = presentation[normalized.code];
  return Response.json(
    {
      error: {
        code: normalized.code,
        message: normalized === known ? message : stable[0],
        retryable: normalized === known ? retryable : stable[1],
        reconciliation: {
          required: (normalized === known ? action : stable[2]) !== "none",
          action: normalized === known ? action : stable[2],
        },
        guarantees: { zeroPartialEffects: true },
      },
      requestId,
    },
    { status: normalized.status, headers: privateHeaders },
  );
}
