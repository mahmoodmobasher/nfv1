import { editCompany } from "@/backend/modules/customer-graph";
import {
  COMPANY_SCREEN_EDIT_V2,
  companyScreenEditCommandV2Schema,
  getScreenProfileV1,
  screenProfileResultV1Schema,
} from "@/backend/modules/screen-forms";
import {
  parseScreenCommand,
  screenFormsRoute,
} from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; companyId: string }> }) {
  const { workspaceId, companyId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) =>
    getScreenProfileV1(pool, actor, "company", companyId, requestId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string; companyId: string }> }) {
  const { workspaceId, companyId } = await params;
  return screenFormsRoute(request, workspaceId, async ({ pool, actor, requestId, key, body }) => {
    const command = parseScreenCommand(companyScreenEditCommandV2Schema, body, COMPANY_SCREEN_EDIT_V2);
    const result = await editCompany(pool, { actor, companyId, requestId, key, command });
    return screenProfileResultV1Schema.parse({
      contractVersion: "screen-profile-result.v1",
      kind: "company",
      recordId: result.companyId,
      version: result.version,
      replayed: result.replayed,
      requestId: result.requestId,
      selection: {
        id: result.companyId,
        label: command.profile.name,
        target: { kind: "version", version: result.version },
      },
    });
  }, 200, true);
}
