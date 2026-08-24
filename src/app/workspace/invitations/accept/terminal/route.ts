import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import {
  clearInvitationIntentCookie,
  clearInvitationReturnCookie,
  INVITATION_ACCEPT_DESTINATION,
} from "@/server/invitations/intent";

export function GET(request: Request) {
  const env = getServerEnv();
  const secure = env.APP_ORIGIN.startsWith("https://");
  const response = NextResponse.redirect(
    new URL(INVITATION_ACCEPT_DESTINATION, request.url),
    303,
  );
  response.headers.set("Set-Cookie", clearInvitationIntentCookie(secure));
  response.headers.append("Set-Cookie", clearInvitationReturnCookie(secure));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
