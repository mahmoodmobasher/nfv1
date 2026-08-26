import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] { return readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const modules = ["leads", "contacts", "companies", "identity-review"];
const moduleFiles = files("src/backend/modules").filter(path => path.endsWith(".ts"));
const platformFiles = files("src/backend/platform").filter(path => path.endsWith(".ts"));
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
const ownedByModule: Record<string, Set<string>> = {
  leads: new Set(["leads", "lead_lifecycle_definitions", "lead_intakes", "lead_activities", "lead_visible_teams", "pipeline_stages"]),
  contacts: new Set(["contacts"]), companies: new Set(["companies"]),
  "customer-graph": new Set(["companies","company_domain_points","company_visible_teams","contacts","contact_identity_points",
    "contact_company_affiliations","contact_visible_teams","workspace_memberships","users","teams","team_memberships"]),
  "identity-review": new Set(["lead_identity_reviews", "lead_identity_candidates", "lead_identity_decisions", "lead_identity_decision_heads"]),
};
function sqlTables(source: string) {
  const ctes = new Set([...source.matchAll(/\b(?:with|,)\s*([a-z][a-z0-9_]*)\s+as\s+(?:materialized\s+)?\(/gi)]
    .map(match => match[1].toLowerCase()));
  return [...source.matchAll(/\b(?:from|join|insert\s+into|update\s+(?!of\b)|delete\s+from)\s*([a-z][a-z0-9_]*)/gi)]
    .map(match => match[1].toLowerCase()).filter(table => !ctes.has(table));
}
function sqlOwnershipViolations(path: string, source: string) {
  const moduleName = path.split("/")[3];
  const reviewed = path.endsWith("companies/application/read-models/contact-company-candidate.read-model.ts")
    ? new Set(["companies", "contacts"]) : ownedByModule[moduleName] ?? new Set<string>();
  return sqlTables(source).filter(table => !reviewed.has(table));
}
const platformSql = {
  authorization: new Set(["workspace_memberships", "roles", "workspaces", "users", "sessions", "teams", "team_memberships", "lead_visible_teams"]),
  audit: new Set(["audit_events"]), outbox: new Set(["outbox_messages"]), database: new Set<string>(),
  idempotency: new Set(["idempotency_records"]),
};
function platformSqlViolations(path: string, source: string) {
  const area = path.split("/")[3] as keyof typeof platformSql;
  const allowed = platformSql[area] ?? new Set<string>();
  return sqlTables(source).filter(table => !allowed.has(table));
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
    required.push("idempotency_records");
    expect(duplicate(rows.map(row => row.table))).toBeUndefined();
    for (const table of required) expect(rows.filter(row => row.table === table), table).toHaveLength(1);
  });

  it("blocks private cross-module, route-repository, and client-server imports", () => {
    for (const path of files("src/app/api/workspaces/[workspaceId]").filter(item => item.endsWith("route.ts") &&
      /\/(?:leads|pipeline-stages)\//.test(item)))
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

  it("rejects undeclared and cross-owner SQL, including negative fixtures", () => {
    for (const path of moduleFiles)
      expect(sqlOwnershipViolations(path, readFileSync(path, "utf8")), path).toEqual([]);
    for (const path of platformFiles)
      expect(platformSqlViolations(path, readFileSync(path, "utf8")), path).toEqual([]);
    expect(sqlOwnershipViolations("src/backend/modules/contacts/persistence/x.ts", "select * from companies"))
      .toEqual(["companies"]);
    expect(sqlOwnershipViolations("src/backend/modules/leads/persistence/x.ts", "insert into mystery_table(id) values(1)"))
      .toEqual(["mystery_table"]);
    expect(sqlOwnershipViolations("src/backend/modules/companies/application/read-models/contact-company-candidate.read-model.ts",
      "select * from contacts join companies on true")).toEqual([]);
    expect(sqlOwnershipViolations("src/backend/modules/identity-review/persistence/x.ts",
      "with selected as materialized (select * from lead_identity_reviews) select * from selected")).toEqual([]);
    expect(platformSqlViolations("src/backend/platform/audit/x.ts", "insert into leads(id) values(1)")).toEqual(["leads"]);
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
    const identities = [...stableSection.matchAll(/^\| (?:operation|query|Audit|event) \| `([^`]+)` \|/gm)].map(match => match[1]);
    expect(duplicate(identities)).toBeUndefined();
    for (const identity of [...fixture.operations, ...fixture.queries, ...fixture.auditActions, ...fixture.events]) expect(identities).toContain(identity);
    expect(duplicate(["one", "one"])).toBe("one");
    expect(stableSection.includes("missing-operation.v1")).toBe(false);
  });

  it("requires public operations in manifests/registry and forbids wildcard repository exports", () => {
    const leadManifest = readFileSync("src/backend/modules/leads/README.md", "utf8");
    for (const operation of ["submitLeadInquiryV1", "listLeadSummariesV1", "getLeadDetailV1", "listLeadPipelineStagesV1",
      "getLeadOperationalEditV1", "editLeadOperationalV1", "transitionLeadStageV1",
      "getIdentityReviewDetailV1", "listIdentityReviewQueueV1", "decideLeadIdentityReviewV1"])
      expect(`${registry}\n${leadManifest}`).toContain(operation);
    for (const moduleName of modules) expect(readFileSync(`src/backend/modules/${moduleName}/index.ts`, "utf8")).not.toMatch(/export \* /);
    expect("manifest without operation".includes("submitLeadInquiryV1")).toBe(false);
  });
});
