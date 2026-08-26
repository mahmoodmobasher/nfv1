import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";
import { SalesError } from "../contracts/deal.contract";
import { salesFailure, salesJson } from "./deal.http";

export async function salesRoute(
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
    return salesFailure(new SalesError("permission_required", 403), requestId);
  const { pool } = localDatabase();
  try {
    const actor = await tenant(pool, request, workspaceId);
    const body = mutation ? await request.json().catch(() => null) : null;
    const key = request.headers.get("idempotency-key") ?? "";
    return salesJson(await work({ pool, actor, requestId, key, body }), status);
  } catch (error) {
    return salesFailure(error, requestId);
  } finally {
    await pool.end();
  }
}

export function parsed<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } };
  },
  body: unknown,
  version: string,
): T {
  if (
    !body ||
    typeof body !== "object" ||
    (body as { contractVersion?: unknown }).contractVersion !== version
  )
    throw new SalesError("unsupported_contract_version", 400);
  const result = schema.safeParse(body);
  if (!result.success) throw new SalesError("validation_failed", 400);
  return result.data;
}
