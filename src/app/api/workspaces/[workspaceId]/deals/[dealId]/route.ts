import {
  SALES_DEAL_UPDATE,
  getDeal,
  salesDealUpdateCommandV1Schema,
  updateDeal,
} from "@/backend/modules/sales";
import {
  parsed,
  salesRoute,
} from "@/backend/modules/sales/presentation/deal.route";

type Context = { params: Promise<{ workspaceId: string; dealId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { workspaceId, dealId } = await params;
  return salesRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getDeal(pool, actor, dealId, requestId),
  );
}

export async function PATCH(request: Request, { params }: Context) {
  const { workspaceId, dealId } = await params;
  return salesRoute(
    request,
    workspaceId,
    ({ pool, actor, requestId, key, body }) =>
      updateDeal(pool, {
        actor,
        dealId,
        requestId,
        key,
        command: parsed(
          salesDealUpdateCommandV1Schema,
          body,
          SALES_DEAL_UPDATE,
        ),
      }),
    200,
    true,
  );
}
