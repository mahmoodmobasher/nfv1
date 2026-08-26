import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  "src/frontend/features/screen-forms/components/screen-profile-form.tsx",
  "utf8",
);

describe("SCREEN-FORMS-01 frontend boundary", () => {
  it("covers every approved screenshot field without donor-only behavior", () => {
    for (const label of [
      "Company name",
      "Domain",
      "Website",
      "Industry",
      "Size band",
      "Employees",
      "Annual revenue",
      "Parent Company",
      "Phone",
      "Salutation",
      "First name",
      "Last name",
      "Company",
      "Job title",
      "Primary email",
      "Secondary email",
      "Office phone",
      "Mobile",
      "Fax",
      "Twitter handle",
      "Promotional email preference",
      "Source",
      "Status",
      "Rating",
      "Department",
      "Direct phone",
      "LinkedIn",
      "Lifecycle stage",
      "Assigned owner",
      "Street",
      "City",
      "State/Province",
      "Postal code",
      "Country",
      "Add internal note",
    ])
      expect(form).toContain(label);
    expect(form).not.toMatch(/AI Notes|create customer|infer.*company/i);
  });

  it("uses strict server options and preserves their version or timestamp targets", () => {
    expect(form).toContain('endpoint(workspaceId, "screen-form-options")');
    expect(form).toContain("screenFormOptionsV1Schema.safeParse");
    expect(form).toContain("selectedCompany.label");
    expect(form).toContain("initialId={lead?.base.stageId}");
    expect(form).toContain("visibleTeamVersions");
  });

  it("gates protected mounting and clears state on authority loss", () => {
    expect(form).toContain('endpoint(workspaceId, "screen-form-bootstrap")');
    expect(form).toContain("!parsed.data.capabilities.canCreate");
    expect(form).toContain(
      'error.reconciliation.action === "clear_protected_state"',
    );
    expect(form).toContain("function clearProtectedState()");
    for (const clearing of [
      "setDetail(null)",
      "setErrors({})",
      'setNotice("")',
      "setResult(null)",
      'setNoteBody("")',
      'request.current = { body: "", key: "" }',
      'noteRequest.current = { body: "", key: "" }',
      "setDenied(true)",
    ])
      expect(form).toContain(clearing);
    expect(
      form.match(/clearProtectedState\(\)/g)?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(form).toContain("onAuthorityLoss={clearProtectedState}");
    expect(form).toContain(
      "screenFormsErrorEnvelopeV1Schema.safeParse(payload)",
    );
  });

  it("keeps Contact Notes a distinct idempotent post-save operation", () => {
    expect(form).toContain("expectedContactVersion: contactVersion");
    expect(form).toContain("contactInternalNoteAddCommandV1Schema.safeParse");
    expect(form).toContain("Contact saved; internal note was not saved.");
    expect(form).toContain("Retry internal note");
    expect(form).toContain('return "authority_cleared" as const');
    expect(form).toContain('if (noteOutcome === "authority_cleared") return');
  });

  it("links validation summaries and exposes stale reload and replay truth", () => {
    expect(form).toContain("href={`#${id}`}");
    expect(form).toContain("aria-invalid={Boolean(error)}");
    expect(form).toContain("Reload latest");
    expect(form).toContain("save was already applied");
    expect(form).toContain("Contact ambiguity remains pending Identity Review");
    expect(form).toContain("linkedFields.has(id)");
    expect(form).not.toContain("href={`#_form`}");
    expect(form).toContain('id="visibility"');
  });
});
