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
});
