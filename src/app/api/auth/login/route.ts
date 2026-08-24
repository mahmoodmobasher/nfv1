import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext, sessionToken } from "@/server/http";
import { loginPassword } from "@/server/identity/service";
import { cookie } from "@/server/security/request";
import { resolveIdentityContext } from "@/server/security/session";
import { selectableWorkspaces } from "@/server/workspaces/selection";
import { privateIdentityJson, privateIdentityResponse } from "@/server/identity/http";
import { clearInvitationReturnCookie, hasValidInvitationReturn, invitationContinuation } from "@/server/invitations/intent";

const input = z.object({ email: z.string().email(), password: z.string().min(1).max(256), next: z.string().max(80).optional() });
export async function POST(request: Request) {
  const rejected = mutationGuard(request); if (rejected) return privateIdentityResponse(rejected);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateIdentityJson({ ok: false, code: "invalid_credentials", message: "The email or password is incorrect." }, { status: 401 });
  const { pool } = localDatabase(); const env = getServerEnv();
  try {
    const result = await loginPassword(pool, { ...parsed.data, riskKey: requestRiskContext(request), existingSession: sessionToken(request) }, identityConfig());
    if (!result.ok) return privateIdentityJson(result, { status: 401 });
    const identity=await resolveIdentityContext(pool,result.sessionToken,env.SESSION_SECRET),workspaces=identity?await selectableWorkspaces(pool,{...identity,activeWorkspaceId:identity.activeWorkspaceId??null}):[];
    const requested=invitationContinuation(parsed.data.next),invitationReturn=requested&&hasValidInvitationReturn(request,env.SESSION_SECRET),destination=invitationReturn?requested:workspaces.length===0?"/workspace/create":workspaces.some(item=>item.current)?"/crm/home":"/workspace/switch";
    const response = privateIdentityJson({ ok: true, next: destination });
    response.headers.set("Set-Cookie", cookie(env.SESSION_COOKIE_NAME, result.sessionToken, { secure: env.APP_ORIGIN.startsWith("https://"), maxAge: env.SESSION_ABSOLUTE_HOURS * 3600 }));
    if(invitationReturn)response.headers.append("Set-Cookie",clearInvitationReturnCookie(env.APP_ORIGIN.startsWith("https://")));
    return response;
  } finally { await pool.end(); }
}
