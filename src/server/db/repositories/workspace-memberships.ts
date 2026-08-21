import { eq } from "drizzle-orm";
import type { WorkspaceAuthorizationContext } from "../../authz/context";
import { requireWorkspaceContext } from "../../authz/context";
import type { AppDatabase } from "../client";
import { workspaceMemberships } from "../schema";

export function listWorkspaceMemberships(
  db: AppDatabase,
  context: WorkspaceAuthorizationContext | null | undefined,
) {
  const authorized = requireWorkspaceContext(context);
  return db
    .select()
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, authorized.workspaceId));
}
