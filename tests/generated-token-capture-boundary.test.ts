import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
// Next 16.3.1 documents this utility as unstable_doesProxyMatch while its
// shipped compatibility export retains the pre-rename Middleware spelling.
import {
  unstable_doesMiddlewareMatch as unstable_doesProxyMatch,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import {
  IDENTITY_TOKEN_CAPTURE_ENTRIES,
  config,
  identityTokenCaptureEntry,
  proxy,
} from "../src/proxy";
import {
  identityTokenIntentSettings,
  openIdentityTokenIntent,
} from "../src/server/identity/token-intent";
import {
  INVITATION_INTENT_COOKIE,
  INVITATION_RETURN_COOKIE,
} from "../src/server/invitations/intent";

const origin = "https://app.nexaflowsystems.com";
const secret = "local-only-session-secret-change-me-32chars";
const identityToken = "identity-capture/synthetic+token-123456789";
const invitationToken = "invitation-capture/synthetic+token-123456789";

const identityEntries = [
  ["/verify-email/capture", "email_verification", "/verify-email"],
  ["/verify-email", "email_verification", "/verify-email"],
  ["/reset-password/capture", "password_reset", "/reset-password"],
  ["/reset-password", "password_reset", "/reset-password"],
] as const;

const exactEntryPaths = [
  ...identityEntries.map(([path]) => path),
  "/workspace/invitations/accept",
] as const;

function splitCookies(response: Response) {
  return response.headers.getSetCookie();
}

function cookieValue(response: Response, name: string) {
  const field = splitCookies(response).find((value) => value.startsWith(`${name}=`));
  if (!field) return null;
  return decodeURIComponent(field.slice(name.length + 1).split(";", 1)[0]);
}

function expectCapturePrivacy(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("content-security-policy")).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(response.headers.get("vary")).toBeNull();
}

async function expectAbsent(response: Response, token: string) {
  const once = encodeURIComponent(token);
  const twice = encodeURIComponent(once);
  const observable = [
    response.headers.get("location") ?? "",
    response.headers.get("set-cookie") ?? "",
    JSON.stringify([...response.headers.entries()]),
    await response.clone().text(),
  ].join("\n");
  for (const value of [token, once, twice]) expect(observable).not.toContain(value);
}

describe("Next 16.3.1 generated-token capture-before-framework boundary", () => {
  it("keeps the exact matcher exclusions and Caddy default-if-absent authority unchanged", () => {
    expect(config).toEqual({
      matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)" }],
    });
    const caddy = readFileSync(new URL("../deploy/uat/Caddyfile", import.meta.url), "utf8");
    expect(caddy.match(/^\s*\?Referrer-Policy\s+"strict-origin-when-cross-origin"\s*$/gm))
      .toHaveLength(1);
    expect(caddy).not.toMatch(/^\s*Referrer-Policy\s+"strict-origin-when-cross-origin"\s*$/m);
  });

  it("matches every entry regardless of HTML, RSC, prefetch, or router presentation", () => {
    const presentations = [
      { label: "HTML" },
      { label: "RSC", headers: { RSC: "1" } },
      { label: "_rsc", query: "_rsc=synthetic" },
      { label: "router prefetch", headers: { "next-router-prefetch": "1" } },
      { label: "purpose prefetch", headers: { purpose: "prefetch" } },
      { label: "router state", headers: { "next-router-state-tree": "synthetic" } },
      {
        label: "combined",
        query: "_rsc=synthetic",
        headers: {
          RSC: "1",
          "next-router-prefetch": "1",
          purpose: "prefetch",
          "next-router-state-tree": "synthetic",
        },
      },
    ];

    for (const path of exactEntryPaths) {
      for (const presentation of presentations) {
        const query = presentation.query ? `?${presentation.query}` : "";
        expect(
          unstable_doesProxyMatch({
            config,
            nextConfig,
            url: `${path}${query}`,
            headers: presentation.headers,
          }),
          `${path}: ${presentation.label}`,
        ).toBe(true);
      }
    }
  });

  it("retains only the accepted matcher exclusions and keeps near misses eligible but uncaptured", () => {
    for (const path of [
      "/api/auth/verify",
      "/_next/static/chunks/app.js",
      "/_next/image?url=%2Flogo.png&w=64&q=75",
      "/favicon.ico",
    ]) {
      expect(unstable_doesProxyMatch({ config, nextConfig, url: path }), path).toBe(false);
    }
    for (const path of [
      "/verify-email/capture/extra",
      "/verify-email-capture",
      "/reset-password/captured",
      "/workspace/invitations/acceptance",
    ]) {
      expect(unstable_doesProxyMatch({ config, nextConfig, url: path }), path).toBe(true);
      expect(identityTokenCaptureEntry(path), path).toBeNull();
    }
  });

  it("exports one frozen exact identity path-purpose-destination mapping", () => {
    expect(Object.isFrozen(IDENTITY_TOKEN_CAPTURE_ENTRIES)).toBe(true);
    expect(Object.keys(IDENTITY_TOKEN_CAPTURE_ENTRIES)).toEqual(
      identityEntries.map(([path]) => path),
    );
    for (const [path, purpose, destination] of identityEntries) {
      const entry = identityTokenCaptureEntry(path);
      expect(entry).toEqual({ purpose, destination });
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it.each(identityEntries)(
    "captures GET %s as only %s and redirects to %s before framework routing",
    async (path, purpose, destination) => {
      const response = proxy(
        new NextRequest(
          `${origin}${path}?unknown=value&token=${encodeURIComponent(identityToken)}&_rsc=synthetic&next=%2Fworkspace%2Finvitations%2Faccept`,
          {
            headers: {
              RSC: "1",
              "next-router-prefetch": "1",
              purpose: "prefetch",
              "next-router-state-tree": "synthetic",
            },
          },
        ),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}${destination}`);
      expectCapturePrivacy(response);
      const settings = identityTokenIntentSettings(purpose);
      const sealed = cookieValue(response, settings.cookie);
      expect(sealed).toBeTruthy();
      expect(openIdentityTokenIntent(purpose, sealed ?? undefined, secret)).toBe(identityToken);
      expect(
        openIdentityTokenIntent(
          purpose === "email_verification" ? "password_reset" : "email_verification",
          sealed ?? undefined,
          secret,
        ),
      ).toBeNull();
      await expectAbsent(response, identityToken);
    },
  );

  it("accepts query reordering while rejecting duplicate, empty, malformed, and oversized identity tokens", async () => {
    const accepted = proxy(
      new NextRequest(`${origin}/verify-email/capture?next=ignored&token=${encodeURIComponent(identityToken)}&extra=1`),
    );
    expect(accepted.status).toBe(303);
    expect(openIdentityTokenIntent(
      "email_verification",
      cookieValue(accepted, "nexaflow_email_verification_intent") ?? undefined,
      secret,
    )).toBe(identityToken);

    for (const query of [
      `token=${identityToken}&token=${identityToken}`,
      "token=",
      "token=short",
      `token=${"x".repeat(201)}`,
      "token=%E0%A4%A",
    ]) {
      const response = proxy(
        new NextRequest(`${origin}/verify-email/capture?${query}`, {
          headers: { cookie: "nexaflow_email_verification_intent=stale-valid-authority" },
        }),
      );
      expect(response.status, query).toBe(303);
      expect(response.headers.get("location"), query).toBe(`${origin}/verify-email`);
      expect(response.headers.get("set-cookie"), query).toContain("Max-Age=0");
      expectCapturePrivacy(response);
      await expectAbsent(response, identityToken);
    }
  });

  it.each(identityEntries)("keeps HEAD %s bodyless and authority-free", async (path, purpose, destination) => {
    const settings = identityTokenIntentSettings(purpose);
    const response = proxy(new NextRequest(`${origin}${path}?token=${identityToken}&_rsc=synthetic`, {
      method: "HEAD",
      headers: { cookie: `${settings.cookie}=stale-valid-authority`, RSC: "1" },
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}${destination}`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.text()).toBe("");
    expectCapturePrivacy(response);
    await expectAbsent(response, identityToken);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "denies unsupported identity capture method %s before framework routing",
    async (method) => {
      const response = proxy(new NextRequest(`${origin}/reset-password/capture?token=${identityToken}`, {
        method,
        headers: { cookie: "nexaflow_password_reset_intent=stale-valid-authority" },
      }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.has("location")).toBe(false);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(await response.text()).toBe("");
      expectCapturePrivacy(response);
      await expectAbsent(response, identityToken);
    },
  );

  it("keeps invitation capture symmetric for presentation, duplicate, HEAD, and unsupported methods", async () => {
    const valid = proxy(new NextRequest(
      `${origin}/workspace/invitations/accept?token=${invitationToken}&_rsc=synthetic`,
      { headers: { RSC: "1", "next-router-prefetch": "1", purpose: "prefetch" } },
    ));
    expect(valid.status).toBe(303);
    expect(valid.headers.get("location")).toBe(`${origin}/workspace/invitations/accept`);
    expect(splitCookies(valid).some((field) => field.startsWith(`${INVITATION_INTENT_COOKIE}=`))).toBe(true);
    expect(splitCookies(valid).some((field) => field.startsWith(`${INVITATION_RETURN_COOKIE}=`))).toBe(true);
    expectCapturePrivacy(valid);
    await expectAbsent(valid, invitationToken);

    for (const [method, query, status] of [
      ["GET", `token=${invitationToken}&token=${invitationToken}`, 303],
      ["HEAD", `token=${invitationToken}`, 303],
      ["POST", `token=${invitationToken}`, 405],
    ] as const) {
      const response = proxy(new NextRequest(`${origin}/workspace/invitations/accept?${query}`, {
        method,
        headers: { cookie: `${INVITATION_INTENT_COOKIE}=stale; ${INVITATION_RETURN_COOKIE}=stale` },
      }));
      expect(response.status, method).toBe(status);
      expect(response.headers.get("set-cookie"), method).toContain("Max-Age=0");
      if (status === 405) expect(response.headers.has("location")).toBe(false);
      else expect(response.headers.get("location")).toBe(`${origin}/workspace/invitations/accept`);
      expectCapturePrivacy(response);
      await expectAbsent(response, invitationToken);
    }
  });

  it("does not loop or mutate intent when the canonical destination has no token key", () => {
    for (const path of ["/verify-email", "/reset-password", "/workspace/invitations/accept"]) {
      const response = proxy(new NextRequest(`${origin}${path}`));
      expect(response.status, path).toBe(200);
      expect(response.headers.has("location"), path).toBe(false);
      expect(response.headers.has("set-cookie"), path).toBe(false);
      expectCapturePrivacy(response);
    }
  });
});
