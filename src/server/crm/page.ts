import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "../db/client";
import { getServerEnv } from "../env";
import { resolveIdentityContext } from "../security/session";
import { resolveTenantContext } from "../tenant-admin/permissions";
import { workspaceSummary } from "../workspaces/provision";
import { selectableWorkspaces } from "../workspaces/selection";

export async function crmPageContext(next="/crm"){
  const env=getServerEnv(),token=(await cookies()).get(env.SESSION_COOKIE_NAME)?.value,{pool}=createDb();
  const identity=await resolveIdentityContext(pool,token,env.SESSION_SECRET,new Date(),{idleMinutes:env.SESSION_IDLE_MINUTES,touchIntervalSeconds:env.SESSION_TOUCH_INTERVAL_SECONDS});
  if(!identity){await pool.end();redirect(`/login?next=${encodeURIComponent(next)}`)}
  let workspace=await workspaceSummary(pool,identity.userId,identity.activeWorkspaceId);if(!workspace&&!identity.activeWorkspaceId){const options=await selectableWorkspaces(pool,{...identity,activeWorkspaceId:null}),selected=options.find(option=>option.current);if(selected)workspace=await workspaceSummary(pool,identity.userId,selected.id)}if(!workspace){const count=(await pool.query("select count(*)::int count from workspace_memberships m join workspaces w on w.id=m.workspace_id and w.status='active' where m.user_id=$1 and m.status='active'",[identity.userId])).rows[0].count;await pool.end();redirect(count?"/workspace/switch":"/workspace/create")}
  const context=await resolveTenantContext(pool,{...identity,workspaceId:workspace.id});if(!context){await pool.end();redirect("/login")}
  return{pool,workspace,context,identity};
}
