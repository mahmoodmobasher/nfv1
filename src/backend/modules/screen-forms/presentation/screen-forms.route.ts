import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";
import { screenFormsErrorEnvelopeV1Schema } from "../contracts/screen-forms.contract";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "cookie",
};

const presentation = {
  authentication_required: ["Authentication is required.", false, "clear_protected_state", 401],
  permission_required: ["This action is not available.", false, "clear_protected_state", 403],
  resource_not_found: ["The requested resource is unavailable.", false, "clear_protected_state", 404],
  validation_failed: ["The request is invalid.", false, "none", 400],
  unsupported_contract_version: ["The contract version is not supported.", false, "none", 400],
  idempotency_conflict: ["The idempotency key conflicts with a prior request.", false, "new_request", 409],
  stale_version: ["The record has changed.", false, "refetch_record", 409],
  selection_unavailable: ["A selected option is no longer available.", false, "refetch_bootstrap", 409],
  authority_conflict: ["The record is not available for this operation.", false, "clear_protected_state", 409],
  screen_form_unavailable: ["The form is temporarily unavailable.", true, "retry_same_request", 503],
  unexpected_error: ["The request could not be completed.", true, "retry_same_request", 500],
} as const;

type ScreenCode = keyof typeof presentation;

const STATIC_ROUTE_SEGMENTS = new Set([
  "api", "workspaces", "screen-form-bootstrap", "screen-form-options",
  "selected", "companies", "contacts", "leads", "profile",
]);
const SCREEN_OPERATIONS = new Set([
  "company-screen-create.v2", "company-screen-edit.v2",
  "contact-screen-create.v2", "contact-screen-edit.v2",
  "lead-screen-create.v2", "lead-screen-edit.v2",
]);
const SAFE_CONSTRAINT = /^[a-z][a-z0-9_]{0,62}$/;
const SAFE_REVISION = /^[0-9a-f]{7,64}$/i;

function routeTemplate(request: Request) {
  try {
    return `/${new URL(request.url).pathname.split("/").filter(Boolean)
      .map((segment) => STATIC_ROUTE_SEGMENTS.has(segment) ? segment : ":id")
      .join("/")}`;
  } catch {
    return "/invalid";
  }
}

function operationFrom(request: Request, body: unknown) {
  const contractVersion =
    body && typeof body === "object" && "contractVersion" in body
      ? (body as { contractVersion?: unknown }).contractVersion
      : null;
  if (typeof contractVersion === "string" && SCREEN_OPERATIONS.has(contractVersion))
    return contractVersion;
  return request.method.toLowerCase();
}

function databaseFailure(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { code?: unknown; constraint?: unknown };
  return {
    ...(typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)
      ? { sqlState: candidate.code }
      : {}),
    ...(typeof candidate.constraint === "string" && SAFE_CONSTRAINT.test(candidate.constraint)
      ? { constraint: candidate.constraint }
      : {}),
  };
}

function logFailure(
  error: unknown,
  known: { code: ScreenCode; status: number },
  requestId: string,
  request: Request,
  body: unknown,
) {
  const configuredRevision = process.env.NEXAFLOW_REVISION ?? "unknown";
  const record = {
    event: "screen_form_request_failed",
    requestId,
    route: routeTemplate(request),
    operation: operationFrom(request, body),
    code: known.code,
    status: known.status,
    revision: SAFE_REVISION.test(configuredRevision) ? configuredRevision : "unknown",
    ...databaseFailure(error),
  };
  const serialized = JSON.stringify(record);
  if (known.status >= 500) console.error(serialized);
  else console.warn(serialized);
}

function normalized(error: unknown): { code: ScreenCode; status: number; fields?: string[]; selection?: unknown } {
  if (!error || typeof error !== "object" || !("code" in error) || !("status" in error))
    return { code: "unexpected_error", status: 500 };
  const candidate = error as { code: string; status: number; fields?: unknown; selection?: unknown; safe?: { fields?: unknown } };
  if (!(candidate.code in presentation)) return { code: "unexpected_error", status: 500 };
  const entry = presentation[candidate.code as ScreenCode];
  if (candidate.status !== entry[3]) return { code: "unexpected_error", status: 500 };
  const source = candidate.fields ?? candidate.safe?.fields;
  const fields = (candidate.status === 400 || candidate.code === "selection_unavailable") && Array.isArray(source)
    ? source.filter((field): field is string => typeof field === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(field)).slice(0, 32)
    : undefined;
  return { code: candidate.code as ScreenCode, status: candidate.status, ...(fields?.length ? { fields } : {}),
    ...(candidate.code === "selection_unavailable" ? { selection: candidate.selection } : {}) };
}

export function screenFormsJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: privateHeaders });
}

export function screenFormsFailure(
  error: unknown,
  requestId: string,
  context?: { request: Request; body: unknown },
) {
  const known = normalized(error), entry = presentation[known.code], action = entry[2];
  if (context) logFailure(error, known, requestId, context.request, context.body);
  const candidate = {
    error: {
      code: known.code,
      message: entry[0],
      retryable: entry[1],
      reconciliation: { required: action !== "none", action },
      ...(known.fields ? { fields: known.fields } : {}),
      ...(known.selection ? { selection: known.selection } : {}),
      zeroPartialEffects: true,
    },
    requestId,
  };
  const parsed = screenFormsErrorEnvelopeV1Schema.safeParse(candidate);
  if (parsed.success)
    return Response.json(parsed.data, { status: known.status, headers: privateHeaders });
  const fallback = presentation.unexpected_error;
  return Response.json({ error: { code: "unexpected_error", message: fallback[0], retryable: fallback[1],
    reconciliation: { required: true, action: fallback[2] }, zeroPartialEffects: true }, requestId },
  { status: fallback[3], headers: privateHeaders });
}

export async function screenFormsRoute(
  request: Request,
  workspaceId: string,
  work: (input: {
    pool: ReturnType<typeof localDatabase>["pool"];
    actor: Awaited<ReturnType<typeof tenant>>;
    requestId: string;
    key: string;
    body: unknown;
  }) => Promise<unknown>,
  status = 200,
  mutation = false,
) {
  const requestId = crypto.randomUUID();
  if (mutation && mutationGuard(request))
    return screenFormsFailure(
      { code: "permission_required", status: 403 },
      requestId,
      { request, body: null },
    );
  const { pool } = localDatabase();
  let body: unknown = null;
  try {
    const actor = await tenant(pool, request, workspaceId);
    body = mutation ? await request.json().catch(() => null) : null;
    return screenFormsJson(await work({
      pool,
      actor,
      requestId,
      key: request.headers.get("idempotency-key") ?? "",
      body,
    }), status);
  } catch (error) {
    return screenFormsFailure(error, requestId, { request, body });
  } finally {
    await pool.end();
  }
}

export function parseScreenCommand<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } } }, body: unknown, version: string): T {
  if (!body || typeof body !== "object" || (body as { contractVersion?: unknown }).contractVersion !== version)
    throw Object.assign(new Error("unsupported_contract_version"), { code: "unsupported_contract_version", status: 400 });
  const result = schema.safeParse(body);
  if (!result.success) throw Object.assign(new Error("validation_failed"), {
    code: "validation_failed",
    status: 400,
    fields: result.error.issues.map(issue => issue.path.map(String).join(".")).filter(Boolean),
  });
  return result.data;
}
