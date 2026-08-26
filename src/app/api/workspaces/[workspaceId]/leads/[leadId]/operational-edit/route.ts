import { getLeadOperationalEditV1, leadManagementFailure, leadManagementJson } from "@/backend/modules/leads";
import { localDatabase } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; leadId: string }> }) {
  const requestId = crypto.randomUUID(), { workspaceId, leadId } = await params, { pool } = localDatabase();
  try {
    return leadManagementJson(await getLeadOperationalEditV1(pool, await tenant(pool, request, workspaceId), leadId, requestId));
  } catch (error) {
    return leadManagementFailure(error, requestId);
  } finally { await pool.end(); }
}
