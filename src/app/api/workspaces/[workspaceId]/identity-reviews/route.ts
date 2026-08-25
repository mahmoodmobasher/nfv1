import { localDatabase } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";
import { leadIntakeFailure, leadIntakeJson, listIdentityReviewQueueV1, parseIdentityReviewQueueFilters } from "@/backend/modules/leads";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { workspaceId } = await params, { pool } = localDatabase(), requestId = crypto.randomUUID();
  try {
    const context = await tenant(pool, request, workspaceId);
    const filters = parseIdentityReviewQueueFilters(new URL(request.url));
    return leadIntakeJson(await listIdentityReviewQueueV1(pool, context, filters, requestId));
  } catch (error) {
    return leadIntakeFailure(error, requestId);
  } finally { await pool.end(); }
}
