import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { mutationGuard } from "@/server/http";
import { invitationIntentCookie, invitationReturnCookie, sealInvitationIntent, sealInvitationReturn } from "@/server/invitations/intent";
import { privateWorkspaceResponse } from "@/server/workspaces/http";

const input = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  const blocked = mutationGuard(request);
  if (blocked) return privateWorkspaceResponse(blocked);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateWorkspaceResponse(NextResponse.json({ code: "invitation_invalid" }, { status: 400 }));
  const env = getServerEnv();
  const response = privateWorkspaceResponse(NextResponse.json({ captured: true }));
  response.headers.set("Set-Cookie", invitationIntentCookie(sealInvitationIntent(parsed.data.token, env.SESSION_SECRET), env.APP_ORIGIN.startsWith("https://")));
  response.headers.append("Set-Cookie", invitationReturnCookie(sealInvitationReturn(env.SESSION_SECRET), env.APP_ORIGIN.startsWith("https://")));
  return response;
}
