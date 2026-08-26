import { editLeadOperationalV1, LeadManagementError, leadManagementFailure, leadManagementJson,
  leadOperationalEditCommandV1Schema } from "@/backend/modules/leads";
import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; leadId: string }> }) {
  const requestId = crypto.randomUUID(), blocked = mutationGuard(request);
  if (blocked) return leadManagementFailure(new LeadManagementError("permission_required", 403), requestId);
  const { workspaceId, leadId } = await params, { pool } = localDatabase();
  try {
    const actor = await tenant(pool, request, workspaceId);
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || (raw as { contractVersion?: unknown }).contractVersion !== "lead-operational-edit.v1")
      throw new LeadManagementError("unsupported_contract_version", 400);
    const parsed = leadOperationalEditCommandV1Schema.safeParse(raw);
    if (!parsed.success) throw new LeadManagementError("validation_failed", 400, { fields: parsed.error.issues
      .map(issue => String(issue.path[0] ?? "")).filter(Boolean) });
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    return leadManagementJson(await editLeadOperationalV1(pool, { actor, leadId, command: parsed.data,
      idempotencyKey, requestId }));
  } catch (error) {
    return leadManagementFailure(error, requestId);
  } finally { await pool.end(); }
}
