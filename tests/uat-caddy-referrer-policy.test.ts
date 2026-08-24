import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(
  new URL("../deploy/uat/Caddyfile", import.meta.url),
  "utf8",
);

function referrerPolicyLines() {
  return caddyfile
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("Referrer-Policy"));
}

function applyDefaultIfAbsent(headers: Headers) {
  if (!headers.has("Referrer-Policy"))
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return headers;
}

function acceptsRepeatedPrivateNoStore(rawCacheFields: readonly string[]) {
  if (rawCacheFields.length < 1) return false;
  const normalizedFields = rawCacheFields.map((value) =>
    value.trim().toLowerCase(),
  );
  if (new Set(normalizedFields).size !== 1) return false;
  const directives = normalizedFields
    .flatMap((value) => value.split(","))
    .map((directive) => directive.trim())
    .filter(Boolean);
  return (
    directives.includes("private") &&
    directives.includes("no-store") &&
    directives.every((directive) =>
      ["private", "no-store"].includes(directive),
    )
  );
}

describe("UAT Caddy Referrer-Policy precedence", () => {
  it("declares one shared default-if-absent operation and no overwriting or appending operation", () => {
    expect(referrerPolicyLines()).toEqual([
      '?Referrer-Policy "strict-origin-when-cross-origin"',
    ]);
    expect(caddyfile).not.toMatch(
      /^\s*(?:Referrer-Policy|[+>-]Referrer-Policy)\s/m,
    );
    expect(caddyfile).toContain("admin off");
    expect(caddyfile).toContain('-Server');
    expect(caddyfile).toContain(
      'Strict-Transport-Security "max-age=31536000; includeSubDomains"',
    );
    expect(caddyfile).toContain('X-Content-Type-Options "nosniff"');
    expect(caddyfile).toContain(
      'Permissions-Policy "camera=(), microphone=(), geolocation=()"',
    );
  });

  it("preserves one upstream no-referrer value and supplies one default only when absent", () => {
    const upstreamPresent = applyDefaultIfAbsent(
      new Headers({ "Referrer-Policy": "no-referrer" }),
    );
    const upstreamAbsent = applyDefaultIfAbsent(new Headers());

    expect(upstreamPresent.get("Referrer-Policy")).toBe("no-referrer");
    expect(upstreamAbsent.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    for (const headers of [upstreamPresent, upstreamAbsent]) {
      const values = [...headers.entries()].filter(
        ([name]) => name.toLowerCase() === "referrer-policy",
      );
      expect(values).toHaveLength(1);
      expect(values[0][1]).not.toContain(",");
    }
  });

  it("retains the non-blocking duplicate private cache defense as an effective private no-store policy", () => {
    const rawCacheFields = ["private, no-store", "private, no-store"];
    const effectiveDirectives = rawCacheFields
      .flatMap((value) => value.split(","))
      .map((directive) => directive.trim().toLowerCase())
      .filter(Boolean);

    expect(rawCacheFields).toHaveLength(2);
    expect(new Set(rawCacheFields)).toEqual(new Set(["private, no-store"]));
    expect(effectiveDirectives).toEqual([
      "private",
      "no-store",
      "private",
      "no-store",
    ]);
    expect(effectiveDirectives).toContain("private");
    expect(effectiveDirectives).toContain("no-store");
    expect(effectiveDirectives).not.toContain("public");
    expect(effectiveDirectives).not.toContain("immutable");
    expect(effectiveDirectives.some((value) => /^(?:s-)?max-age=/.test(value))).toBe(
      false,
    );
    expect(effectiveDirectives.some((value) => value.startsWith("stale-"))).toBe(
      false,
    );
    expect(acceptsRepeatedPrivateNoStore(rawCacheFields)).toBe(true);
  });

  it("fails closed on absent, conflicting, weakened, or unparsable cache fields", () => {
    for (const fields of [
      [],
      ["private, no-store", "public, max-age=60"],
      ["private, no-store", "private"],
      ["private, no-store, stale-if-error=60"],
      ["private, no-store, unknown-directive"],
    ]) {
      expect(acceptsRepeatedPrivateNoStore(fields), JSON.stringify(fields)).toBe(
        false,
      );
    }
  });
});
