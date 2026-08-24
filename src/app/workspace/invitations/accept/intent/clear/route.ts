import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { mutationGuard } from "@/server/http";
import { clearInvitationIntentCookie, clearInvitationReturnCookie } from "@/server/invitations/intent";
import { privateWorkspaceResponse } from "@/server/workspaces/http";

export async function POST(request: Request) {
  const blocked = mutationGuard(request);
  if (blocked) return privateWorkspaceResponse(blocked);
  const env = getServerEnv(), response = privateWorkspaceResponse(NextResponse.json({ cleared: true }));
  response.headers.set("Set-Cookie", clearInvitationIntentCookie(env.APP_ORIGIN.startsWith("https://")));
  response.headers.append("Set-Cookie", clearInvitationReturnCookie(env.APP_ORIGIN.startsWith("https://")));
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
