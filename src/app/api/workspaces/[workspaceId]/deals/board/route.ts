import {
  getDealBoard,
  salesDealBoardQueryV1Schema,
  SalesError,
} from "@/backend/modules/sales";
import { salesRoute } from "@/backend/modules/sales/presentation/deal.route";
import { parseStageCursors } from "@/backend/modules/sales/presentation/deal-query";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return salesRoute(request, workspaceId, ({ pool, actor, requestId }) => {
    const url = new URL(request.url);
    const result = salesDealBoardQueryV1Schema.safeParse({
      pipelineId: url.searchParams.get("pipelineId") ?? undefined,
      limitPerStage: url.searchParams.has("limitPerStage")
        ? Number(url.searchParams.get("limitPerStage"))
        : undefined,
      stageCursors: parseStageCursors(url.searchParams),
    });
    if (!result.success) throw new SalesError("validation_failed", 400);
    return getDealBoard(pool, actor, result.data, requestId);
  });
}
