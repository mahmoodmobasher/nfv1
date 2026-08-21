import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { cookie, CSRF_COOKIE, issueCsrfToken } from "@/server/security/request";

export async function GET() {
  const env = getServerEnv();
  const token = issueCsrfToken();
  const response = NextResponse.json({ token });
  response.headers.set("Set-Cookie", cookie(CSRF_COOKIE, token, { secure: env.APP_ORIGIN.startsWith("https://"), maxAge: 3600 }));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
