import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  PROTECTED_TOKEN_LIFECYCLE_PATHS,
  isProtectedTokenLifecyclePath,
  proxy,
  setProtectedTokenLifecycleHeaders,
} from "../src/proxy";

const expectedPaths = [
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

const nearMisses = [
  "/verify-email/",
  "/verify-email/complete/extra",
  "/reset-passworded",
  "/reset-password/complete/",
  "/workspace/invitations/acceptance",
  "/workspace/invitations/accept/terminal/extra",
  "/api/auth/verify",
  "/api/auth/reset-complete",
  "/api/invitations/accept",
];

describe("protected website token lifecycle headers", () => {
  it("exports one frozen, exact, duplicate-free canonical path contract", () => {
    expect(PROTECTED_TOKEN_LIFECYCLE_PATHS).toEqual(expectedPaths);
    expect(Object.isFrozen(PROTECTED_TOKEN_LIFECYCLE_PATHS)).toBe(true);
    expect(new Set(PROTECTED_TOKEN_LIFECYCLE_PATHS).size).toBe(
      expectedPaths.length,
    );

    for (const path of expectedPaths)
      expect(isProtectedTokenLifecyclePath(path), path).toBe(true);
    for (const path of nearMisses)
      expect(isProtectedTokenLifecyclePath(path), path).toBe(false);
  });

  it("uses replacement semantics for one effective private no-store and no-referrer value", () => {
    const headers = new Headers([
      ["Cache-Control", "public, max-age=3600"],
      ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ]);

    setProtectedTokenLifecycleHeaders(headers);
    setProtectedTokenLifecycleHeaders(headers);

    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(
      [...headers.entries()].filter(
        ([name]) => name.toLowerCase() === "cache-control",
      ),
    ).toEqual([["cache-control", "private, no-store"]]);
    expect(
      [...headers.entries()].filter(
        ([name]) => name.toLowerCase() === "referrer-policy",
      ),
    ).toEqual([["referrer-policy", "no-referrer"]]);
  });

  it.each(expectedPaths)(
    "protects every method and query shape on exact path %s",
    (path) => {
      for (const method of ["GET", "POST", "PUT", "DELETE", "OPTIONS"]) {
        const response = proxy(
          new NextRequest(`https://app.nexaflowsystems.com${path}?state=denied`, {
            method,
          }),
        );
        expect(response.headers.get("cache-control"), method).toBe(
          "private, no-store",
        );
        expect(response.headers.get("referrer-policy"), method).toBe(
          "no-referrer",
        );
      }
    },
  );

  it.each(nearMisses)("does not classify near-miss path %s", (path) => {
    const response = proxy(
      new NextRequest(`https://app.nexaflowsystems.com${path}`),
    );
    expect(response.headers.has("referrer-policy")).toBe(false);
    expect(response.headers.has("cache-control")).toBe(false);
  });
});
