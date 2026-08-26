import {
  LeadConversionError,
  convertLeadToDealV1,
  leadConvertToDealCommandV1Schema,
} from "@/backend/modules/leads";
import {
  leadConversionFailure,
  leadConversionJson,
} from "@/backend/modules/leads/presentation/lead-conversion.http";
import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; leadId: string }> },
) {
  const requestId = crypto.randomUUID();
  const blocked = mutationGuard(request);
  if (blocked)
    return leadConversionFailure(
      new LeadConversionError("permission_required", 403),
      requestId,
    );
  const { workspaceId, leadId } = await params;
  const { pool } = localDatabase();
  try {
    const parsed = leadConvertToDealCommandV1Schema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new LeadConversionError("validation_failed", 400);
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const actor = await tenant(pool, request, workspaceId);
    return leadConversionJson(
      await convertLeadToDealV1(pool, {
        actor,
        leadId,
        command: parsed.data,
        idempotencyKey,
        requestId,
      }),
    );
  } catch (error) {
    return leadConversionFailure(error, requestId);
  } finally {
    await pool.end();
  }
}
