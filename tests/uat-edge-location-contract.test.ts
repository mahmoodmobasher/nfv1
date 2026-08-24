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

function headers(status: number, locations: readonly string[] = []) {
  return [
    `HTTP/2 ${status}`,
    ...locations.map((location) => `Location: ${location}`),
    "Cache-Control: private, no-store",
    "",
    "",
  ].join("\r\n");
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
  it.each([
    ["relative clean", "/verify-email"],
    ["absolute same-origin clean", `${origin}/verify-email`],
  ])("accepts %s redirect", (_label, location) => {
    expect(validate(headers(303, [location]))).toEqual({
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
