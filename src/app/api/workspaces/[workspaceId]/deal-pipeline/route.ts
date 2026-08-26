import { getSalesPipeline } from "@/backend/modules/sales";
import { salesRoute } from "@/backend/modules/sales/presentation/deal.route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return salesRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getSalesPipeline(pool, actor, requestId),
  );
}
