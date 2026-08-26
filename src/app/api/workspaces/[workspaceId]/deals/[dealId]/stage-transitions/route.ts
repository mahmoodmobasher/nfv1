import {
  SALES_DEAL_STAGE_TRANSITION,
  salesDealStageTransitionCommandV1Schema,
  transitionDeal,
} from "@/backend/modules/sales";
import {
  parsed,
  salesRoute,
} from "@/backend/modules/sales/presentation/deal.route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; dealId: string }> },
) {
  const { workspaceId, dealId } = await params;
  return salesRoute(
    request,
    workspaceId,
    ({ pool, actor, requestId, key, body }) =>
      transitionDeal(pool, {
        actor,
        dealId,
        requestId,
        key,
        command: parsed(
          salesDealStageTransitionCommandV1Schema,
          body,
          SALES_DEAL_STAGE_TRANSITION,
        ),
      }),
    200,
    true,
  );
}
