import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { validateEdgeLocation } from "../deploy/uat/validate-edge-location.mjs";

const origin = "https://app.nexaflowsystems.com";
const expectedPath = "/verify-email";
const marker = "SENSITIVE_MARKER_MUST_NOT_APPEAR";
const temporaryDirectories: string[] = [];
const destinations = [
  ["verification", "/verify-email"],
  ["reset", "/reset-password"],
] as const;

function headers(status: number, locations: readonly string[] = []) {
  return [
    `HTTP/2 ${status}`,
    ...locations.map((location) => `Location: ${location}`),
    "Cache-Control: private, no-store",
    "",
    "",
  ].join("\r\n");
}

function headersWithStatusLine(statusLine: string, location = expectedPath) {
  return `${statusLine}\r\nLocation: ${location}\r\n\r\n`;
}

function validate(headersText: string, overrides: Partial<{
  origin: string;
  expectedPath: string;
  probe: string;
}> = {}) {
  return validateEdgeLocation({
    headersText,
    origin: overrides.origin ?? origin,
    expectedPath: overrides.expectedPath ?? expectedPath,
    probe: overrides.probe ?? "verify-html",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("UAT edge Location contract", () => {
  it.each(destinations.flatMap(([destination, path]) => [
    [`${destination} relative clean`, path, path],
    [`${destination} absolute same-origin clean`, `${origin}${path}`, path],
  ]))("accepts %s redirect", (_label, location, path) => {
    expect(validate(headers(303, [location]), { expectedPath: path })).toEqual({
      ok: true,
      probe: "verify-html",
      reason: null,
    });
  });

  it.each([
    ["307", headers(307, ["/verify-email"]), "redirect_status_unsafe"],
    ["308", headers(308, ["/verify-email"]), "redirect_status_unsafe"],
    ["non-303", headers(302, ["/verify-email"]), "status_not_303"],
    ["missing", headers(303), "location_missing"],
    ["empty", headers(303, [""]), "location_empty"],
    ["duplicate", headers(303, ["/verify-email", "/verify-email"]), "location_duplicate"],
    ["comma joined", headers(303, ["/verify-email, /verify-email"]), "location_comma_joined"],
    ["scheme relative same host", headers(303, ["//app.nexaflowsystems.com/verify-email"]), "location_scheme_relative"],
    ["scheme relative foreign host", headers(303, ["//attacker.invalid/verify-email"]), "location_scheme_relative"],
    ["cross origin", headers(303, ["https://attacker.invalid/verify-email"]), "location_cross_origin"],
    ["subdomain confusion", headers(303, ["https://app.nexaflowsystems.com.attacker.invalid/verify-email"]), "location_cross_origin"],
    ["userinfo", headers(303, ["https://user:pass@app.nexaflowsystems.com/verify-email"]), "location_userinfo"],
    ["encoded segment", headers(303, ["/%76erify-email"]), "location_encoded_ambiguity"],
    ["encoded slash", headers(303, ["/verify-email%2fextra"]), "location_encoded_ambiguity"],
    ["double encoding", headers(303, ["/verify-email%252fextra"]), "location_encoded_ambiguity"],
    ["backslash normalization", headers(303, ["/verify-email\\extra"]), "location_backslash"],
    ["ambiguous relative", headers(303, ["verify-email"]), "location_relative_ambiguous"],
    ["query", headers(303, [`/verify-email?token=${marker}`]), "location_query"],
    ["fragment", headers(303, [`/verify-email#${marker}`]), "location_fragment"],
    ["token path", headers(303, [`/verify-email/${marker}`]), "location_path"],
    ["wrong clean path", headers(303, ["/reset-password"]), "location_path"],
    ["response chain", `${headers(307, ["/verify-email"])}${headers(303, ["/verify-email"])}`, "response_chain"],
    ["folded header", "HTTP/2 303\r\nLocation: /verify-email\r\n injected\r\n\r\n", "headers_invalid"],
  ])("rejects %s", (_label, headersText, reason) => {
    expect(validate(headersText)).toEqual({ ok: false, probe: "verify-html", reason });
  });

  it.each(destinations.flatMap(([destination, path]) => {
    const leaf = path.slice(1);
    return [
      [`${destination} empty query delimiter`, headers(303, [`${path}?`]), "location_query", path],
      [`${destination} non-empty query delimiter`, headers(303, [`${path}?token=${marker}`]), "location_query", path],
      [`${destination} absolute empty query delimiter`, headers(303, [`${origin}${path}?`]), "location_query", path],
      [`${destination} empty fragment delimiter`, headers(303, [`${path}#`]), "location_fragment", path],
      [`${destination} non-empty fragment delimiter`, headers(303, [`${path}#${marker}`]), "location_fragment", path],
      [`${destination} absolute empty fragment delimiter`, headers(303, [`${origin}${path}#`]), "location_fragment", path],
      [`${destination} parent segment`, headers(303, [`/a/../${leaf}`]), "location_dot_segment", path],
      [`${destination} current segment`, headers(303, [`/./${leaf}`]), "location_dot_segment", path],
      [`${destination} terminal parent segment`, headers(303, [`/${leaf}/..`]), "location_dot_segment", path],
      [`${destination} terminal current segment`, headers(303, [`/${leaf}/.`]), "location_dot_segment", path],
      [`${destination} absolute parent segment`, headers(303, [`${origin}/a/../${leaf}`]), "location_dot_segment", path],
      [`${destination} spaced field name`, `HTTP/2 303\r\nLocation : ${path}\r\n\r\n`, "headers_invalid", path],
      [`${destination} tabbed field name`, `HTTP/2 303\r\nLocation\t: ${path}\r\n\r\n`, "headers_invalid", path],
      [`${destination} malformed preamble`, `unrecognized preamble\r\n\r\n${headers(303, [path])}`, "headers_invalid", path],
      [`${destination} malformed suffix`, `${headers(303, [path])}unrecognized suffix\r\n\r\n`, "headers_invalid", path],
      [`${destination} whitespace response block`, ` \r\n\r\n${headers(303, [path])}`, "headers_invalid", path],
      [`${destination} informational without final`, "HTTP/1.1 103 Early Hints\r\nLink: </asset.css>\r\n\r\n", "response_chain", path],
      [`${destination} informational after final`, `${headers(303, [path])}HTTP/1.1 103 Early Hints\r\nLink: </asset.css>\r\n\r\n`, "response_order", path],
      [`${destination} prohibited value control`, `HTTP/2 303\r\nLocation: ${path}\r\nX-Evidence: safe\u0001unsafe\r\n\r\n`, "headers_invalid", path],
    ];
  }))("rejects Architecture example: %s", (_label, headersText, reason, path) => {
    const result = validate(headersText, { expectedPath: path });
    expect(result).toEqual({ ok: false, probe: "verify-html", reason });
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it.each(destinations.flatMap(([destination, path]) => [
    [`${destination} relative after informational`, path, path],
    [`${destination} absolute after informational`, `${origin}${path}`, path],
  ]))("accepts ordered informational blocks: %s", (_label, location, path) => {
    const evidence = [
      "HTTP/1.1 100 Continue\r\nRequest-Id: bounded\r\n\r\n",
      "HTTP/1.1 103 Early Hints\r\nLink: </asset.css>\r\n\r\n",
      headers(303, [location]),
    ].join("");
    expect(validate(evidence, { expectedPath: path })).toEqual({
      ok: true,
      probe: "verify-html",
      reason: null,
    });
  });

  it.each([
    ["HTTP/1.0", "HTTP/1.0 303"],
    ["HTTP/1.1 with reason", "HTTP/1.1 303 See Other"],
    ["HTTP/2", "HTTP/2 303"],
    ["HTTP/3 with bounded reason", "HTTP/3 303 Redirect"],
  ])("accepts supported status-line form %s", (_label, statusLine) => {
    expect(validate(headersWithStatusLine(statusLine))).toEqual({
      ok: true,
      probe: "verify-html",
      reason: null,
    });
  });

  it.each([
    ["alphabetic version", "HTTP/banana 303"],
    ["lowercase protocol", "http/2 303"],
    ["Unicode NBSP separator", "HTTP/2\u00a0303"],
    ["Unicode EM SPACE separator", "HTTP/2\u2003303"],
    ["tab separator", "HTTP/2\t303"],
    ["unsupported decimal HTTP/2.0", "HTTP/2.0 303"],
    ["unsupported arbitrary HTTP/999", "HTTP/999 303"],
    ["malformed version punctuation", "HTTP/1..1 303"],
    ["missing version", "HTTP/ 303"],
    ["status below range", "HTTP/2 099"],
    ["status above range", "HTTP/2 600"],
    ["short status", "HTTP/2 30"],
    ["long status", "HTTP/2 3030"],
    ["double ASCII separator", "HTTP/2  303"],
    ["trailing separator", "HTTP/2 303 "],
    ["trailing invalid token", "HTTP/2 303 See Other\u0001"],
    ["non-ASCII reason phrase", "HTTP/2 303 R\u00e9orienter"],
    ["overlong reason phrase", `HTTP/2 303 ${"A".repeat(129)}`],
  ])("rejects malformed status-line form: %s", (_label, statusLine) => {
    expect(validate(headersWithStatusLine(statusLine))).toEqual({
      ok: false,
      probe: "verify-html",
      reason: "headers_invalid",
    });
  });

  it("rejects unsafe probe identifiers without reflecting them", () => {
    const result = validate(headers(303, ["/verify-email"]), { probe: marker });
    expect(result).toEqual({ ok: false, probe: "invalid", reason: "probe_invalid" });
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it.each([
    ["origin userinfo", `https://${marker}@app.nexaflowsystems.com`, "origin_invalid", undefined],
    ["origin path", `${origin}/unexpected`, "origin_invalid", undefined],
    ["encoded expected path", origin, "expected_path_invalid", "/%76erify-email"],
  ])("rejects invalid %s authority", (_label, candidateOrigin, reason, candidatePath) => {
    expect(validate(headers(303, ["/verify-email"]), {
      origin: candidateOrigin,
      expectedPath: candidatePath ?? expectedPath,
    })).toMatchObject({ ok: false, reason });
  });

  it("CLI reports only a safe probe and reason for a token-bearing failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "nexaflow-edge-location-"));
    temporaryDirectories.push(directory);
    const headerFile = join(directory, "headers.txt");
    writeFileSync(headerFile, headers(303, [`/verify-email?token=${marker}`]), { mode: 0o600 });
    const script = new URL("../deploy/uat/validate-edge-location.mjs", import.meta.url);
    const execution = spawnSync(process.execPath, [
      script.pathname,
      "--probe", "verify-rsc",
      "--origin", origin,
      "--expected-path", expectedPath,
      "--headers", headerFile,
    ], { encoding: "utf8" });

    expect(execution.status).toBe(1);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "location_contract=fail probe=verify-rsc reason=location_query\n",
    );
    expect(`${execution.stdout}${execution.stderr}`).not.toContain(marker);
    expect(`${execution.stdout}${execution.stderr}`).not.toContain(headerFile);
  });

  it("CLI preserves a valid probe identifier on argument failure", () => {
    const script = new URL("../deploy/uat/validate-edge-location.mjs", import.meta.url);
    const execution = spawnSync(process.execPath, [
      script.pathname,
      "--probe", "verify-arguments",
    ], { encoding: "utf8" });

    expect(execution.status).toBe(64);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "location_contract=fail probe=verify-arguments reason=arguments_invalid\n",
    );
  });

  it("CLI suppresses an unreadable header path", () => {
    const script = new URL("../deploy/uat/validate-edge-location.mjs", import.meta.url);
    const sensitivePath = join(tmpdir(), marker);
    const execution = spawnSync(process.execPath, [
      script.pathname,
      "--probe", "verify-unreadable",
      "--origin", origin,
      "--expected-path", expectedPath,
      "--headers", sensitivePath,
    ], { encoding: "utf8" });

    expect(execution.status).toBe(1);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "location_contract=fail probe=verify-unreadable reason=headers_unreadable\n",
    );
    expect(execution.stderr).not.toContain(marker);
    expect(execution.stderr).not.toContain(sensitivePath);
  });

  it("CLI replaces an unsafe probe identifier on failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "nexaflow-edge-location-"));
    temporaryDirectories.push(directory);
    const headerFile = join(directory, "headers.txt");
    writeFileSync(headerFile, headers(303, ["/verify-email"]), { mode: 0o600 });
    const script = new URL("../deploy/uat/validate-edge-location.mjs", import.meta.url);
    const execution = spawnSync(process.execPath, [
      script.pathname,
      "--probe", marker,
      "--origin", origin,
      "--expected-path", expectedPath,
      "--headers", headerFile,
    ], { encoding: "utf8" });

    expect(execution.status).toBe(1);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "location_contract=fail probe=invalid reason=probe_invalid\n",
    );
    expect(execution.stderr).not.toContain(marker);
  });

  it("CLI accepts both clean forms and emits no response value", () => {
    for (const [index, location] of ["/verify-email", `${origin}/verify-email`].entries()) {
      const directory = mkdtempSync(join(tmpdir(), "nexaflow-edge-location-"));
      temporaryDirectories.push(directory);
      const headerFile = join(directory, `headers-${index}.txt`);
      writeFileSync(headerFile, headers(303, [location]), { mode: 0o600 });
      const script = new URL("../deploy/uat/validate-edge-location.mjs", import.meta.url);
      const execution = spawnSync(process.execPath, [
        script.pathname,
        "--probe", `verify-clean-${index}`,
        "--origin", origin,
        "--expected-path", expectedPath,
        "--headers", headerFile,
      ], { encoding: "utf8" });

      expect(execution.status).toBe(0);
      expect(execution.stderr).toBe("");
      expect(execution.stdout).toBe(
        `location_contract=pass probe=verify-clean-${index}\n`,
      );
      expect(execution.stdout).not.toContain(location);
    }
  });
});
