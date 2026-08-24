import { afterEach, describe, expect, it } from "vitest";
import { GET as csrf } from "../src/app/api/auth/csrf/route";
import { privateSessionJson } from "../src/server/identity/http";
import { POST as register } from "../src/app/api/auth/register/route";
import { POST as resetComplete } from "../src/app/api/auth/reset-complete/route";
import { requestRiskContext } from "../src/server/http";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

function mutation(headers: Record<string, string> = {}, body = "{") {
  return new Request("http://127.0.0.1:3000/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("authentication route boundary", () => {
  it("keeps session status minimal and private on both outcomes", async () => {
    for (const authenticated of [true, false]) {
      const response = privateSessionJson(authenticated);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ authenticated });
    }
  });
  it("rejects malformed JSON after valid same-origin CSRF", async () => {
    const response = await register(mutation({ origin: "http://127.0.0.1:3000", cookie: "nexaflow_csrf=token", "x-csrf-token": "token" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects weak registration and reset passwords at the direct route boundary", async () => {
    const headers = { origin: "http://127.0.0.1:3000", cookie: "nexaflow_csrf=token", "x-csrf-token": "token", "content-type": "application/json" };
    const weakRegistration = await register(new Request("http://127.0.0.1:3000/api/auth/register", { method: "POST", headers, body: JSON.stringify({ email: "weak@example.test", displayName: "Weak", password: "abcdefghijkl" }) }));
    const weakReset = await resetComplete(new Request("http://127.0.0.1:3000/api/auth/reset-complete", { method: "POST", headers, body: JSON.stringify({ token: "x".repeat(43), password: "abcdefghijkl" }) }));
    expect([weakRegistration.status, weakReset.status]).toEqual([400, 400]);
    expect(weakRegistration.headers.get("cache-control")).toBe("private, no-store");
    expect(weakReset.headers.get("cache-control")).toBe("private, no-store");
  });

  it("ignores spoofed forwarding headers unless authenticated trusted-proxy mode is configured", () => {
    Object.assign(process.env, { NODE_ENV: "test", TRUSTED_PROXY_ENABLED: "false" });
    const direct = new Request("http://127.0.0.1:3000", { headers: { "x-forwarded-for": "198.51.100.1" } });
    const rotated = new Request("http://127.0.0.1:3000", { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(requestRiskContext(direct)).toEqual({ networkKey: "direct-local" });
    expect(requestRiskContext(rotated)).toEqual({ networkKey: "direct-local" });
    Object.assign(process.env, { TRUSTED_PROXY_ENABLED: "true", TRUSTED_PROXY_SECRET: "trusted-proxy-internal-secret-32-characters" });
    const trusted = new Request("http://127.0.0.1:3000", { headers: { "x-forwarded-for": "198.51.100.1", "x-nexaflow-proxy-secret": "trusted-proxy-internal-secret-32-characters" } });
    expect(requestRiskContext(trusted)).toEqual({ networkKey: "proxy:198.51.100.1" });
  });

  it("rejects missing and mismatched CSRF without touching persistence", async () => {
    const missing = await register(mutation({ origin: "http://127.0.0.1:3000" }));
    const mismatched = await register(mutation({ origin: "http://127.0.0.1:3000", cookie: "nexaflow_csrf=one", "x-csrf-token": "two" }));
    expect([missing.status, mismatched.status]).toEqual([403, 403]);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect(mismatched.headers.get("cache-control")).toBe("private, no-store");
    expect(await missing.json()).toMatchObject({ code: "request_rejected" });
  });

  it("rejects cross-origin Origin and Referer while accepting same-origin Referer", async () => {
    const csrfHeaders = { cookie: "nexaflow_csrf=token", "x-csrf-token": "token" };
    const badOrigin = await register(mutation({ ...csrfHeaders, origin: "https://evil.example" }));
    const badReferer = await register(mutation({ ...csrfHeaders, referer: "https://evil.example/form" }));
    const goodReferer = await register(mutation({ ...csrfHeaders, referer: "http://127.0.0.1:3000/register" }));
    expect([badOrigin.status, badReferer.status, goodReferer.status]).toEqual([403, 403, 400]);
  });

  it("sets HttpOnly SameSite cookies without Secure for local HTTP", async () => {
    Object.assign(process.env, { NODE_ENV: "test", APP_ORIGIN: "http://127.0.0.1:3000" });
    const response = await csrf();
    const value = response.headers.get("set-cookie") ?? "";
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).not.toContain("; Secure");
  });

  it("sets Secure cookies for production HTTPS", async () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://app:placeholder@db.example.invalid/nexaflow",
      SESSION_COOKIE_NAME: "nexaflow_session",
      SESSION_SECRET: "production-placeholder-secret-at-least-32-characters",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "not-a-real-resend-credential",
      EMAIL_FROM: "NexaFlow accounts <accounts@mail.nexaflowsystems.com>",
      APP_ORIGIN: "https://app.example.invalid",
      SESSION_IDLE_MINUTES: "30",
      SESSION_ABSOLUTE_HOURS: "24",
      SESSION_TOUCH_INTERVAL_SECONDS: "60",
      TRUSTED_PROXY_ENABLED: "false",
      OIDC_FIXTURE_SECRET: "production-fixture-placeholder-secret-32-characters",
      OIDC_MODE: "disabled",
      OIDC_REDIRECT_URIS: "https://app.example.invalid/api/auth/oidc/callback",
    });
    const response = await csrf();
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });
});
