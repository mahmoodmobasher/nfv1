import type { Pool } from "pg";
import { lookupActiveActor, type TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import { workspaceNavigationCapabilitiesV1Schema } from "../contracts/workspace-navigation.contract";

const manager = (role: TrustedActor["role"]) => role === "owner" || role === "admin";

export async function getWorkspaceNavigationCapabilitiesV1(
  pool: Pool,
  actor: TrustedActor,
  workspaceId: string,
  requestId: string,
) {
  if (actor.workspaceId !== workspaceId) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
  return runModuleTransaction(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor);
    if (current.workspaceId !== workspaceId) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const finalActor = await lookupActiveActor(tx, current);
    if (finalActor.workspaceId !== workspaceId) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const finalManage = manager(finalActor.role);
    return workspaceNavigationCapabilitiesV1Schema.parse({
      contractVersion: "workspace-navigation-capabilities.v1",
      workspaceId,
      capabilities: {
        home: { canView: true },
        companies: { canView: true, canCreate: finalManage },
        contacts: { canView: true, canCreate: finalManage },
        leads: { canView: true, canCreate: finalManage },
        identityReview: { canView: finalManage },
        deals: { canView: true, canCreate: finalManage },
        pipeline: { canView: true },
        settings: {
          canViewPersonal: true,
          canViewWorkspace: finalManage,
          canManagePeople: finalManage,
          canManageInvitations: finalManage,
          canManageTeams: finalManage,
        },
      },
      requestId,
    });
  });
}
