import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "../db/client";
import { getServerEnv } from "../env";
import { resolveIdentityContext } from "../security/session";
import { resolveTenantContext } from "../tenant-admin/permissions";
import { workspaceSummary } from "../workspaces/provision";

export async function crmPageContext(next="/crm"){
  const env=getServerEnv(),token=(await cookies()).get(env.SESSION_COOKIE_NAME)?.value,{pool}=createDb();
  const identity=await resolveIdentityContext(pool,token,env.SESSION_SECRET,new Date(),{idleMinutes:env.SESSION_IDLE_MINUTES,touchIntervalSeconds:env.SESSION_TOUCH_INTERVAL_SECONDS});
  if(!identity){await pool.end();redirect(`/login?next=${encodeURIComponent(next)}`)}
  const workspace=await workspaceSummary(pool,identity.userId);if(!workspace){await pool.end();redirect("/workspace/create")}
  const context=await resolveTenantContext(pool,{...identity,workspaceId:workspace.id});if(!context){await pool.end();redirect("/login")}
  return{pool,workspace,context};
}
