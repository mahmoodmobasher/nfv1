import { editContact } from "@/backend/modules/customer-graph";
import {
  CONTACT_SCREEN_EDIT_V2,
  contactScreenEditCommandV2Schema,
  getScreenProfileV1,
  screenProfileResultV1Schema,
} from "@/backend/modules/screen-forms";
import {
  parseScreenCommand,
  screenFormsRoute,
} from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const { workspaceId, contactId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getScreenProfileV1(pool, actor, "contact", contactId, requestId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const { workspaceId, contactId } = await params;
  return screenFormsRoute(request, workspaceId, async ({ pool, actor, requestId, key, body }) => {
    const command = parseScreenCommand(contactScreenEditCommandV2Schema, body, CONTACT_SCREEN_EDIT_V2);
    const result = await editContact(pool, { actor, contactId, requestId, key, command });
    return screenProfileResultV1Schema.parse({
      contractVersion: "screen-profile-result.v1",
      kind: "contact",
      recordId: result.contactId,
      version: result.version,
      replayed: result.replayed,
      requestId: result.requestId,
    });
  }, 200, true);
}
