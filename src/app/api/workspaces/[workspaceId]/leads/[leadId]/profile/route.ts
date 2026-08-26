import { editLeadScreenV2, getScreenProfileV1, LEAD_SCREEN_EDIT_V2, leadScreenEditCommandV2Schema } from "@/backend/modules/screen-forms";
import { parseScreenCommand, screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; leadId: string }> }) {
  const { workspaceId, leadId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getScreenProfileV1(pool, actor, "lead", leadId, requestId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string; leadId: string }> }) {
  const { workspaceId, leadId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId, key, body }) =>
    editLeadScreenV2(pool, { actor, leadId, requestId, key,
      command: parseScreenCommand(leadScreenEditCommandV2Schema, body, LEAD_SCREEN_EDIT_V2) }), 200, true);
}
