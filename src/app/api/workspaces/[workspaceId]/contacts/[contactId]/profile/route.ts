import { getScreenProfileV1 } from "@/backend/modules/screen-forms";
import { screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const { workspaceId, contactId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getScreenProfileV1(pool, actor, "contact", contactId, requestId));
}
