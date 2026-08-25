import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] { return readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const modules = ["leads", "contacts", "companies", "identity-review"];
const moduleFiles = files("src/backend/modules").filter(path => path.endsWith(".ts"));
const registry = readFileSync("docs/architecture/capability-registry.md", "utf8");

function routeViolation(source: string) {
  return /(?:@\/backend\/modules\/.+\/persistence\/|(?:\.\.\/)+.*(?:persistence|repositories)\/|@\/server\/db)/.test(source);
}
function clientServerViolation(source: string) {
  return /^\s*["']use client["']/m.test(source) && /from\s+["']@\/(?:backend|server)\//.test(source);
}
function duplicate(values: string[]) { return values.find((value, index) => values.indexOf(value) !== index); }
function hasCycle(graph: Record<string, string[]>) {
  const active = new Set<string>(), done = new Set<string>();
  const visit = (node: string): boolean => active.has(node) || (!done.has(node) && (() => {
    active.add(node); const found = (graph[node] ?? []).some(visit); active.delete(node); done.add(node); return found;
  })());
  return Object.keys(graph).some(visit);
}
function ownershipRows(markdown: string) {
  const section = markdown.split("## Table ownership inventory")[1]?.split("## Stable identity inventory")[0] ?? "";
  return [...section.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)].map(match => ({ table: match[1], owner: match[2].trim() }));
}

describe("P1A modular-monolith boundaries", () => {
  it("declares public entries, manifests, Platform inventory, and every P1A table exactly once", () => {
    for (const moduleName of modules) {
      expect(statSync(`src/backend/modules/${moduleName}/index.ts`).isFile()).toBe(true);
      expect(statSync(`src/backend/modules/${moduleName}/README.md`).isFile()).toBe(true);
    }
    expect(statSync("src/backend/platform/README.md").isFile()).toBe(true);
    for (const area of ["database", "idempotency", "authorization", "audit", "outbox"]) {
      expect(statSync(`src/backend/platform/${area}/index.ts`).isFile(), area).toBe(true);
      expect(readFileSync("src/backend/platform/README.md", "utf8").toLowerCase()).toContain(area);
    }
    const rows = ownershipRows(registry), required = ["leads", "lead_intakes", "lead_activities", "lead_visible_teams",
      "contacts", "companies", "lead_identity_reviews", "lead_identity_candidates", "lead_identity_decisions",
      "lead_identity_decision_heads", "audit_events", "outbox_messages"];
    expect(duplicate(rows.map(row => row.table))).toBeUndefined();
    for (const table of required) expect(rows.filter(row => row.table === table), table).toHaveLength(1);
  });

  it("blocks private cross-module, route-repository, and client-server imports", () => {
    for (const path of files("src/app/api/workspaces/[workspaceId]/leads").filter(item => item.endsWith("route.ts")))
      expect(routeViolation(readFileSync(path, "utf8")), path).toBe(false);
    for (const path of moduleFiles) {
      const source = readFileSync(path, "utf8"), own = path.split("/")[3];
      const privateImport = [...source.matchAll(/@\/backend\/modules\/([^/]+)\/(domain|application|persistence|policies|events|testing)\//g)]
        .find(match => match[1] !== own);
      expect(privateImport, path).toBeUndefined();
    }
    for (const path of files("src").filter(item => /\.(?:ts|tsx)$/.test(item)))
      expect(clientServerViolation(readFileSync(path, "utf8")), path).toBe(false);
    expect(routeViolation(`import {x} from "../../backend/modules/leads/persistence/repositories/x"`)).toBe(true);
    expect(routeViolation(`import {db} from "@/server/db/client"`)).toBe(true);
    expect(clientServerViolation(`"use client"; import {x} from "@/backend/modules/leads"`)).toBe(true);
  });

  it("has an acyclic public module graph and proves the negative cycle fixture", () => {
    const graph = Object.fromEntries(modules.map(moduleName => [moduleName, [] as string[]]));
    for (const path of moduleFiles) {
      const own = path.split("/")[3], source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/@\/backend\/modules\/([^/]+)["']/g)) if (match[1] !== own) graph[own].push(match[1]);
    }
    expect(hasCycle(graph)).toBe(false);
    expect(hasCycle({ leads: ["contacts"], contacts: ["leads"] })).toBe(true);
  });

  it("keeps stable operations/events unique, registered, and fixture-locked", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/p1a-contract-v1.json", "utf8")) as Record<string, string[]>;
    const stableSection = registry.split("## Stable identity inventory")[1] ?? "";
    const identities = [...stableSection.matchAll(/^\| (?:operation|Audit|event) \| `([^`]+)` \|/gm)].map(match => match[1]);
    expect(duplicate(identities)).toBeUndefined();
    for (const identity of [...fixture.operations, ...fixture.auditActions, ...fixture.events]) expect(identities).toContain(identity);
    expect(duplicate(["one", "one"])).toBe("one");
    expect(stableSection.includes("missing-operation.v1")).toBe(false);
  });

  it("requires public operations in manifests/registry and forbids wildcard repository exports", () => {
    const leadManifest = readFileSync("src/backend/modules/leads/README.md", "utf8");
    for (const operation of ["submitLeadInquiryV1", "decideLeadIdentityReviewV1"])
      expect(`${registry}\n${leadManifest}`).toContain(operation);
    for (const moduleName of modules) expect(readFileSync(`src/backend/modules/${moduleName}/index.ts`, "utf8")).not.toMatch(/export \* /);
    expect("manifest without operation".includes("submitLeadInquiryV1")).toBe(false);
  });
});
