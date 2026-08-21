import { randomOpaqueToken, safeEqual } from "./crypto";

export const CSRF_COOKIE = "nexaflow_csrf";

export function issueCsrfToken(): string {
  return randomOpaqueToken();
}

export function assertTrustedMutation(request: Request, expectedOrigin: string): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin ?? (referer ? new URL(referer).origin : null);
  if (source !== new URL(expectedOrigin).origin) throw new Error("untrusted_origin");
  const cookie = parseCookies(request.headers.get("cookie"))[CSRF_COOKIE];
  const header = request.headers.get("x-csrf-token");
  if (!cookie || !header || !safeEqual(cookie, header)) throw new Error("csrf_invalid");
}

export function parseCookies(value: string | null): Record<string, string> {
  return Object.fromEntries((value ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function cookie(name: string, value: string, options: { maxAge?: number; secure?: boolean } = {}): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}${options.maxAge === undefined ? "" : `; Max-Age=${options.maxAge}`}`;
}
