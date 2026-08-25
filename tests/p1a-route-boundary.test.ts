import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leadIntakeFailure, leadIntakeJson, LeadIntakeError } from "../src/backend/modules/leads";

describe("P1A route boundary", () => {
  it("keeps the Lead routes thin and repository-free", () => {
    for (const path of ["src/app/api/workspaces/[workspaceId]/leads/route.ts", "src/app/api/workspaces/[workspaceId]/leads/[leadId]/identity-review/route.ts",
      "src/app/api/workspaces/[workspaceId]/identity-reviews/route.ts", "src/app/api/workspaces/[workspaceId]/pipeline-stages/route.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("/persistence/");
      expect(source).not.toMatch(/from ["']@\/server\/db/);
    }
  });
  it("gates canonical P1A Leads before the legacy PATCH parser or writer can run",()=>{
    const source=readFileSync("src/app/api/workspaces/[workspaceId]/leads/[leadId]/route.ts","utf8");
    const gate=source.lastIndexOf("assertLegacyLeadPatchAllowedV1"),parse=source.indexOf("leadInputSchema.extend"),write=source.indexOf("updateLead(pool");
    expect(gate).toBeGreaterThan(-1);expect(parse).toBeGreaterThan(gate);expect(write).toBeGreaterThan(parse);
    expect(source).not.toContain("getLeadDetailV1(pool,await updateLead");
  });
  it("marks success and errors private/no-store and exposes only stable errors", async () => {
    const success = leadIntakeJson({ ok: true }, 201);
    const assertPrivate = (response: Response) => {
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("vary")).toBe("cookie");
    };
    assertPrivate(success);
    const failure = leadIntakeFailure(new LeadIntakeError("resource_not_found", 404), "request-1");
    expect(failure.status).toBe(404);
    expect(await failure.json()).toEqual({ error: { code: "resource_not_found", message: "The requested resource is unavailable.",
      retryable: false, reconciliation: { required: false, action: "none" } }, requestId: "request-1" });
    const leadId = crypto.randomUUID();
    const stale = leadIntakeFailure(new LeadIntakeError("stale_version", 409, undefined,
      { kind: "identity_review_detail", leadId }), "request-2");
    expect(await stale.json()).toEqual({ error: { code: "stale_version", message: "The identity review has changed.",
      retryable: false, reconciliation: { required: true, action: "refetch_identity_review" } }, requestId: "request-2",
      nextView: { kind: "identity_review_detail", leadId } });
    const invalidNavigation = leadIntakeFailure(new LeadIntakeError("stale_version", 409, undefined,
      { kind: "identity_review_detail", leadId: "not-a-uuid" }), "request-invalid-navigation");
    expect(await invalidNavigation.json()).not.toHaveProperty("nextView");
    const invalidDetails = leadIntakeFailure(new LeadIntakeError("validation_failed", 400,
      { fields: ["person.email"], unexpected: "raw" }), "request-invalid-details");
    expect((await invalidDetails.json()).error).not.toHaveProperty("details");
    const unknown = leadIntakeFailure({ code: "postgres_internal", status: 418 }, "request-3");
    expect(unknown.status).toBe(500);
    expect(await unknown.json()).toMatchObject({ error: { code: "unexpected_error", message: "The request could not be completed." } });
    for (const response of [failure, stale, unknown,
      leadIntakeFailure(new LeadIntakeError("validation_failed", 400), "request-4"),
      leadIntakeFailure(new LeadIntakeError("authentication_required", 401), "request-5"),
      leadIntakeFailure(new LeadIntakeError("permission_required", 403), "request-6")]) assertPrivate(response);
  });
});
