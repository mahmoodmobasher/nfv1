import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leadIntakeFailure, leadIntakeJson, LeadIntakeError } from "../src/backend/modules/leads";

describe("P1A route boundary", () => {
  it("keeps the Lead routes thin and repository-free", () => {
    for (const path of ["src/app/api/workspaces/[workspaceId]/leads/route.ts", "src/app/api/workspaces/[workspaceId]/leads/[leadId]/identity-review/route.ts",
      "src/app/api/workspaces/[workspaceId]/identity-reviews/route.ts"]) {
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
    expect(await failure.json()).toEqual({ error: { code: "resource_not_found", message: "The requested resource is unavailable.",
      retryable: false, reconciliation: { required: false, action: "none" } }, requestId: "request-1" });
    const leadId = crypto.randomUUID();
    const stale = leadIntakeFailure(new LeadIntakeError("stale_version", 409), "request-2",
      { kind: "identity_review_detail", leadId });
    expect(await stale.json()).toEqual({ error: { code: "stale_version", message: "The identity review has changed.",
      retryable: false, reconciliation: { required: true, action: "refetch_identity_review" } }, requestId: "request-2",
      nextView: { kind: "identity_review_detail", leadId } });
    const unknown = leadIntakeFailure({ code: "postgres_internal", status: 418 }, "request-3");
    expect(unknown.status).toBe(500);
    expect(await unknown.json()).toMatchObject({ error: { code: "unexpected_error", message: "The request could not be completed." } });
  });
});
