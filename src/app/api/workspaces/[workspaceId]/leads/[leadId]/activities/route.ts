import { ACTIVITY_CREATE_V1, ActivityError, activityCreateCommandV1Schema, activityFailure, activityJson,
  activityListQueryV1Schema, createLeadActivityV1, listLeadActivitiesV1, parseActivityListSearchParams }
  from "@/backend/modules/activities";
import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

type Context = { params: Promise<{ workspaceId: string; leadId: string }> };

export async function GET(request: Request, { params }: Context) {
  const requestId = crypto.randomUUID(), { workspaceId, leadId } = await params, { pool } = localDatabase();
  try {
    const actor = await tenant(pool, request, workspaceId), raw = parseActivityListSearchParams(new URL(request.url).searchParams),
      parsed = activityListQueryV1Schema.safeParse(raw);
    if (!parsed.success) throw new ActivityError("validation_failed", 400, { fields: parsed.error.issues
      .map(issue => String(issue.path[0] ?? "")).filter(Boolean) });
    return activityJson(await listLeadActivitiesV1(pool, actor, leadId, parsed.data, requestId));
  } catch (error) { return activityFailure(error, requestId); }
  finally { await pool.end(); }
}

export async function POST(request: Request, { params }: Context) {
  const requestId = crypto.randomUUID(), blocked = mutationGuard(request);
  if (blocked) return activityFailure(new ActivityError("permission_required", 403), requestId);
  const { workspaceId, leadId } = await params, { pool } = localDatabase();
  try {
    const actor = await tenant(pool, request, workspaceId), raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || (raw as { contractVersion?: unknown }).contractVersion !== ACTIVITY_CREATE_V1)
      throw new ActivityError("unsupported_contract_version", 400);
    const parsed = activityCreateCommandV1Schema.safeParse(raw);
    if (!parsed.success) throw new ActivityError("validation_failed", 400, { fields: parsed.error.issues
      .map(issue => String(issue.path[0] ?? "")).filter(Boolean) });
    return activityJson(await createLeadActivityV1(pool, { actor, leadId, command: parsed.data,
      idempotencyKey: request.headers.get("idempotency-key") ?? "", requestId }), 201);
  } catch (error) { return activityFailure(error, requestId); }
  finally { await pool.end(); }
}
