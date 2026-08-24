#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SAFE_PROBE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;
const STATUS_LINE = /^HTTP\/(?:1\.0|1\.1|2|3) ([1-5][0-9]{2})(?: ([\x21-\x7e](?:[\x20-\x7e]{0,126}[\x21-\x7e])?))?$/;

function safeProbe(value) {
  return typeof value === "string" && SAFE_PROBE.test(value) ? value : "invalid";
}

function result(ok, probe, reason = null) {
  return Object.freeze({ ok, probe: safeProbe(probe), reason });
}

function reject(probe, reason) {
  return result(false, probe, reason);
}

function parseResponseBlocks(headersText) {
  const blocks = headersText
    .split(/\r?\n\r?\n/)
    .filter((block) => block.length > 0)
    .map((block) => block.split(/\r?\n/));

  const responses = [];
  for (const lines of blocks) {
    const statusMatch = STATUS_LINE.exec(lines[0]);
    if (!statusMatch) return null;
    const status = Number(statusMatch[1]);
    const headers = new Map();
    for (const line of lines.slice(1)) {
      if (/^[ \t]/.test(line)) return null;
      const separator = line.indexOf(":");
      if (separator <= 0) return null;
      const rawName = line.slice(0, separator);
      const rawValue = line.slice(separator + 1);
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(rawName)) return null;
      if (/[\u0000-\u001f\u007f-\u009f]/.test(rawValue)) return null;
      const name = rawName.toLowerCase();
      const value = rawValue.trim();
      const values = headers.get(name) ?? [];
      values.push(value);
      headers.set(name, values);
    }
    responses.push({ status, headers });
  }
  return responses;
}

function canonicalOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function canonicalExpectedPath(expectedPath) {
  if (!SAFE_PATH.test(expectedPath)) return null;
  if (expectedPath.includes("//") || expectedPath.includes("/./") || expectedPath.includes("/../"))
    return null;
  return expectedPath;
}

function rawPath(raw) {
  if (raw.startsWith("/")) return raw;
  const absolute = /^https?:\/\/[^/]*(\/.*)?$/i.exec(raw);
  return absolute ? absolute[1] ?? "/" : null;
}

function hasRawDotSegment(pathname) {
  return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

export function validateEdgeLocation({ headersText, origin, expectedPath, probe }) {
  if (safeProbe(probe) === "invalid") return reject(probe, "probe_invalid");
  if (typeof headersText !== "string") return reject(probe, "headers_invalid");

  const base = canonicalOrigin(origin);
  if (!base) return reject(probe, "origin_invalid");
  const expected = canonicalExpectedPath(expectedPath);
  if (!expected) return reject(probe, "expected_path_invalid");

  const responses = parseResponseBlocks(headersText);
  if (!responses?.length) return reject(probe, "headers_invalid");
  let response = null;
  for (const candidate of responses) {
    if (candidate.status < 200) {
      if (response) return reject(probe, "response_order");
      continue;
    }
    if (response) return reject(probe, "response_chain");
    response = candidate;
  }
  if (!response) return reject(probe, "response_chain");
  if (response.status !== 303)
    return reject(probe, response.status === 307 || response.status === 308 ? "redirect_status_unsafe" : "status_not_303");

  const locations = response.headers.get("location") ?? [];
  if (locations.length === 0) return reject(probe, "location_missing");
  if (locations.length !== 1) return reject(probe, "location_duplicate");
  const raw = locations[0];
  if (!raw) return reject(probe, "location_empty");
  if (raw.includes(",")) return reject(probe, "location_comma_joined");
  if (/\s|[\u0000-\u001f\u007f]/.test(raw)) return reject(probe, "location_control_or_space");
  if (raw.startsWith("//") || raw.startsWith("\\\\")) return reject(probe, "location_scheme_relative");
  if (raw.includes("\\")) return reject(probe, "location_backslash");
  if (raw.includes("%")) return reject(probe, "location_encoded_ambiguity");
  if (raw.includes("?")) return reject(probe, "location_query");
  if (raw.includes("#")) return reject(probe, "location_fragment");
  if (!(raw.startsWith("/") || /^https?:\/\//i.test(raw)))
    return reject(probe, "location_relative_ambiguous");
  const unnormalizedPath = rawPath(raw);
  if (!unnormalizedPath) return reject(probe, "location_invalid");
  if (hasRawDotSegment(unnormalizedPath)) return reject(probe, "location_dot_segment");

  let resolved;
  try {
    resolved = new URL(raw, base);
  } catch {
    return reject(probe, "location_invalid");
  }
  if (resolved.username || resolved.password) return reject(probe, "location_userinfo");
  if (resolved.origin !== base.origin) return reject(probe, "location_cross_origin");
  if (resolved.search) return reject(probe, "location_query");
  if (resolved.hash) return reject(probe, "location_fragment");
  if (resolved.pathname !== expected) return reject(probe, "location_path");
  return result(true, probe);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) return null;
    values.set(key, value);
  }
  const allowed = new Set(["--probe", "--origin", "--expected-path", "--headers"]);
  if ([...values.keys()].some((key) => !allowed.has(key))) return null;
  if ([...allowed].some((key) => !values.has(key))) return null;
  return values;
}

function probeFromArguments(argv) {
  const indexes = argv.flatMap((value, index) => value === "--probe" ? [index] : []);
  if (indexes.length !== 1) return "invalid";
  return safeProbe(argv[indexes[0] + 1]);
}

function runCli(argv) {
  const args = parseArguments(argv);
  const probe = probeFromArguments(argv);
  if (!args) {
    process.stderr.write(`location_contract=fail probe=${probe} reason=arguments_invalid\n`);
    return 64;
  }

  let headersText;
  try {
    headersText = readFileSync(args.get("--headers"), "utf8");
  } catch {
    process.stderr.write(`location_contract=fail probe=${probe} reason=headers_unreadable\n`);
    return 1;
  }
  const validation = validateEdgeLocation({
    headersText,
    origin: args.get("--origin"),
    expectedPath: args.get("--expected-path"),
    probe: args.get("--probe"),
  });
  if (!validation.ok) {
    process.stderr.write(
      `location_contract=fail probe=${validation.probe} reason=${validation.reason}\n`,
    );
    return 1;
  }
  process.stdout.write(`location_contract=pass probe=${validation.probe}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = runCli(process.argv.slice(2));
