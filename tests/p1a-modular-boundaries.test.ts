import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] { return readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
const moduleFiles = files("src/backend/modules").filter(path => path.endsWith(".ts"));

describe("P1A modular-monolith boundaries", () => {
  it("declares public entries, manifests, and one table owner registry", () => {
    for (const moduleName of ["leads", "contacts", "companies", "identity-review"]) {
      expect(statSync(`src/backend/modules/${moduleName}/index.ts`).isFile()).toBe(true);
      expect(statSync(`src/backend/modules/${moduleName}/README.md`).isFile()).toBe(true);
    }
    const registry = readFileSync("docs/architecture/capability-registry.md", "utf8");
    for (const table of ["`leads`", "`contacts`", "`companies`", "`lead_identity_reviews`"]) expect(registry).toContain(table);
  });
  it("prevents routes and modules from importing private cross-module persistence", () => {
    const routes = files("src/app/api").filter(path => path.endsWith("route.ts"));
    for (const path of routes) expect(readFileSync(path, "utf8"), path).not.toMatch(/backend\/modules\/.+\/persistence\//);
    for (const path of moduleFiles) {
      const source = readFileSync(path, "utf8");
      const own = path.split("/")[3];
      const privateImport = [...source.matchAll(/@\/backend\/modules\/([^/]+)\/(domain|application|persistence|policies|events|testing)\//g)]
        .find(match => match[1] !== own);
      expect(privateImport, path).toBeUndefined();
    }
  });
  it("keeps module public entries free of repository exports by name", () => {
    for (const moduleName of ["leads", "contacts", "companies", "identity-review"]) {
      const source = readFileSync(`src/backend/modules/${moduleName}/index.ts`, "utf8");
      expect(source).not.toMatch(/export \* /);
    }
  });
});
