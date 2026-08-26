import { SalesError, type SalesErrorCode } from "../contracts/deal.contract";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "cookie",
};

const errors: Record<
  SalesErrorCode,
  [
    message: string,
    status: number,
    action: "none" | "refetch_deal" | "refetch_pipeline" | "retry_same_request",
  ]
> = {
  authentication_required: ["Authentication is required.", 401, "none"],
  permission_required: ["This action is not available.", 403, "none"],
  resource_not_found: ["The requested Deal is unavailable.", 404, "none"],
  validation_failed: ["The request is invalid.", 400, "none"],
  unsupported_contract_version: [
    "The contract version is not supported.",
    400,
    "none",
  ],
  idempotency_conflict: [
    "The idempotency key conflicts with a prior request.",
    409,
    "none",
  ],
  stale_version: ["The Deal has changed.", 409, "refetch_deal"],
  pipeline_unavailable: [
    "The Sales pipeline is unavailable.",
    409,
    "refetch_pipeline",
  ],
  stage_unavailable: [
    "The selected stage is unavailable.",
    409,
    "refetch_pipeline",
  ],
  party_unavailable: [
    "A selected customer record is unavailable.",
    409,
    "refetch_deal",
  ],
  assignment_unavailable: [
    "The selected responsibility is unavailable.",
    409,
    "refetch_deal",
  ],
  terminal_deal: ["This Deal is already closed.", 409, "refetch_deal"],
  sales_unavailable: [
    "Sales records are temporarily unavailable.",
    503,
    "retry_same_request",
  ],
  unexpected_error: [
    "The request could not be completed.",
    500,
    "retry_same_request",
  ],
};

export function salesJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers });
}

export function salesFailure(error: unknown, requestId: string) {
  const known =
    error instanceof SalesError
      ? error
      : error &&
          typeof error === "object" &&
          "code" in error &&
          "status" in error
        ? new SalesError(
            (error as { code: SalesErrorCode }).code,
            Number((error as { status: number }).status),
          )
        : new SalesError("unexpected_error", 500);
  const entry = errors[known.code] ?? errors.unexpected_error;
  const safe =
    entry[1] === known.status ? known : new SalesError("unexpected_error", 500);
  const stable = errors[safe.code];
  return Response.json(
    {
      error: {
        code: safe.code,
        message: stable[0],
        retryable: stable[1] >= 500,
        reconciliation: {
          required: stable[2] !== "none",
          action: stable[2],
        },
      },
      requestId,
    },
    { status: stable[1], headers },
  );
}
