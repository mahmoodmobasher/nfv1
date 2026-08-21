import { NextResponse } from "next/server";
import { createDb } from "./db/client";
import { getServerEnv } from "./env";
import { assertTrustedMutation, parseCookies } from "./security/request";
import { safeEqual } from "./security/crypto";

export const SESSION_COOKIE = "nexaflow_session";
export function identityConfig() {
  const env = getServerEnv();
  return { secret: env.SESSION_SECRET, appOrigin: env.APP_ORIGIN, idleMinutes: env.SESSION_IDLE_MINUTES, absoluteHours: env.SESSION_ABSOLUTE_HOURS, touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS };
}
export function mutationGuard(request: Request): NextResponse | null {
  try { assertTrustedMutation(request, getServerEnv().APP_ORIGIN); return null; }
  catch { return NextResponse.json({ ok: false, code: "request_rejected", message: "The request could not be accepted." }, { status: 403 }); }
}
export type RequestRiskContext = { networkKey: string };
export function requestRiskContext(request: Request): RequestRiskContext {
  const env = getServerEnv();
  const suppliedSecret = request.headers.get("x-nexaflow-proxy-secret");
  if (env.TRUSTED_PROXY_ENABLED === "true" && env.TRUSTED_PROXY_SECRET && suppliedSecret && safeEqual(suppliedSecret, env.TRUSTED_PROXY_SECRET)) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (forwarded) return { networkKey: `proxy:${forwarded}` };
  }
  return { networkKey: "direct-local" };
}
export function sessionToken(request: Request): string | undefined {
  return parseCookies(request.headers.get("cookie"))[getServerEnv().SESSION_COOKIE_NAME];
}
export function localDatabase() { return createDb(); }
