import {
  SALES_DEAL_CREATE,
  createDeal,
  listDeals,
  salesDealCreateCommandV1Schema,
  salesDealListQueryV1Schema,
} from "@/backend/modules/sales";
import {
  parsed,
  salesRoute,
} from "@/backend/modules/sales/presentation/deal.route";
import { SalesError } from "@/backend/modules/sales";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return salesRoute(request, workspaceId, ({ pool, actor, requestId }) => {
    const url = new URL(request.url);
    const result = salesDealListQueryV1Schema.safeParse({
      lifecycle: url.searchParams.get("lifecycle") ?? undefined,
      pipelineId: url.searchParams.get("pipelineId") ?? undefined,
      stageId: url.searchParams.get("stageId") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
    });
    if (!result.success) throw new SalesError("validation_failed", 400);
    return listDeals(pool, actor, result.data, requestId);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return salesRoute(
    request,
    workspaceId,
    ({ pool, actor, requestId, key, body }) =>
      createDeal(pool, {
        actor,
        requestId,
        key,
        command: parsed(
          salesDealCreateCommandV1Schema,
          body,
          SALES_DEAL_CREATE,
        ),
      }),
    201,
    true,
  );
}
