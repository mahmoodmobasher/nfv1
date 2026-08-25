import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leadIntakeFailure, leadIntakeJson, LeadIntakeError } from "../src/backend/modules/leads";

describe("P1A route boundary", () => {
  it("keeps the Lead routes thin and repository-free", () => {
    for (const path of ["src/app/api/workspaces/[workspaceId]/leads/route.ts", "src/app/api/workspaces/[workspaceId]/leads/[leadId]/identity-review/route.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("/persistence/");
      expect(source).not.toMatch(/from ["']@\/server\/db/);
    }
  });
  it("marks success and errors private/no-store and exposes only stable errors", async () => {
    const success = leadIntakeJson({ ok: true }, 201);
    expect(success.headers.get("cache-control")).toContain("no-store");
    const failure = leadIntakeFailure(new LeadIntakeError("resource_not_found", 404), "request-1");
    expect(failure.status).toBe(404);
    expect(await failure.json()).toEqual({ error: { code: "resource_not_found" }, requestId: "request-1" });
  });
});
