import { expect, test } from "playwright/test";

const protectedPaths = [
  "/verify-email",
  "/verify-email/capture",
  "/verify-email/complete",
  "/reset-password",
  "/reset-password/capture",
  "/reset-password/complete",
  "/workspace/invitations/accept",
  "/workspace/invitations/accept/complete",
  "/workspace/invitations/accept/intent",
  "/workspace/invitations/accept/intent/clear",
  "/workspace/invitations/accept/terminal",
] as const;

const token = "token-lifecycle-browser-probe-1234567890";

function expectProtectedHeaders(headers: Record<string, string>) {
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["content-security-policy"]).toContain("'strict-dynamic'");
  expect(headers["content-security-policy"]).toMatch(/'nonce-[^']+'/);
}

function expectPrivateNoStore(headers: Record<string, string>) {
  expect(headers["cache-control"]).toBe("private, no-store");
}

test("direct application protects exact token paths across route and framework outcomes", async ({
  context,
}) => {
  for (const path of protectedPaths) {
    for (const method of ["GET", "PUT"] as const) {
      const response = await context.request.fetch(path, {
        method,
        maxRedirects: 0,
      });
      expectProtectedHeaders(response.headers());
      const body = await response.text();
      expect(body).not.toContain(token);
      expect(JSON.stringify(response.headers())).not.toContain(token);
    }
  }
});

test("completion and clear CSRF and Origin denials retain privacy without token reflection", async ({
  context,
}) => {
  const cases: Array<{
    headers: Record<string, string>;
    label: string;
  }> = [
    { headers: {}, label: "missing CSRF and Origin" },
    {
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: "nexaflow_csrf=one",
        "x-csrf-token": "two",
        "content-type": "application/json",
      },
      label: "mismatched CSRF",
    },
    {
      headers: {
        origin: "https://attacker.invalid",
        cookie: "nexaflow_csrf=same",
        "x-csrf-token": "same",
        "content-type": "application/json",
      },
      label: "cross Origin",
    },
    {
      headers: {
        cookie: "nexaflow_csrf=same",
        "x-csrf-token": "same",
        "content-type": "application/json",
      },
      label: "absent Origin",
    },
  ];
  const mutationPaths = [
    "/verify-email/complete",
    "/reset-password/complete",
    "/workspace/invitations/accept/complete",
    "/workspace/invitations/accept/intent/clear",
  ];

  for (const path of mutationPaths) {
    for (const { headers, label } of cases) {
      const response = await context.request.post(path, {
        headers,
        data: { token, password: "Remediation-probe-only-123!" },
        maxRedirects: 0,
      });
      expect(response.status(), `${path}: ${label}`).toBe(403);
      expectProtectedHeaders(response.headers());
      expectPrivateNoStore(response.headers());
      expect(await response.text()).not.toContain(token);
      expect(JSON.stringify(response.headers())).not.toContain(token);
    }
  }
});

test("near misses keep application policy silent", async ({ context }) => {
  for (const path of [
    "/verify-email/complete/extra",
    "/reset-password/complete/extra",
    "/workspace/invitations/accept/terminal/extra",
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()["referrer-policy"]).toBeUndefined();
    expect(response.headers()["cache-control"]).not.toBe("private, no-store");
  }
});
