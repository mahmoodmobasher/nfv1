import { getLeadConversionPreviewV1 } from "@/backend/modules/leads";
import {
  leadConversionFailure,
  leadConversionJson,
} from "@/backend/modules/leads/presentation/lead-conversion.http";
import { localDatabase } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; leadId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { workspaceId, leadId } = await params;
  const { pool } = localDatabase();
  try {
    const actor = await tenant(pool, request, workspaceId);
    return leadConversionJson(
      await getLeadConversionPreviewV1(pool, actor, leadId, requestId),
    );
  } catch (error) {
    return leadConversionFailure(error, requestId);
  } finally {
    await pool.end();
  }
}
