import {
  SALES_DEAL_LIFECYCLE,
  changeDealLifecycle,
  salesDealLifecycleCommandV1Schema,
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
    ({ pool, actor, requestId, key, body }) => {
      const command = parsed(
        salesDealLifecycleCommandV1Schema,
        body,
        SALES_DEAL_LIFECYCLE,
      );
      return changeDealLifecycle(pool, {
        actor,
        dealId,
        expectedVersion: command.expectedVersion,
        to: "active",
        key,
        requestId,
      });
    },
    200,
    true,
  );
}
