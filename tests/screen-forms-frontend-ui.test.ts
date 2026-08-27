import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mergeOptions,
  optionIdentity,
  reconcileOptionIdentity,
  selectedOptionParams,
} from "../src/frontend/features/screen-forms/components/screen-form-options";

const form = readFileSync(
  "src/frontend/features/screen-forms/components/screen-profile-form.tsx",
  "utf8",
);
const options = readFileSync(
  "src/frontend/features/screen-forms/components/screen-form-options.tsx",
  "utf8",
);
const leadOwner = readFileSync(
  "src/backend/modules/leads/application/orchestrators/screen-forms.owner.ts",
  "utf8",
);

describe("SCREEN-FORMS-01 frontend boundary", () => {
  it("canonicalizes selected authority locks by owner and ID before acquisition", () => {
    expect(leadOwner).toContain("const lockGroups = new Map");
    expect(leadOwner).toContain("`${selected.optionKind}:${selected.id}`");
    expect(leadOwner).toContain("left.optionKind.localeCompare(right.optionKind)");
    expect(leadOwner).toContain("left.id.localeCompare(right.id)");
    expect(leadOwner.indexOf("const orderedGroups")).toBeLessThan(
      leadOwner.indexOf("for (const group of orderedGroups)"),
    );
  });
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
    expect(options).toContain('endpoint(workspaceId, "screen-form-options")');
    expect(options).toContain("screenFormOptionsV1Schema.safeParse");
    expect(form).toContain("selectedCompany.label");
    expect(form).toContain("updatedAt: lead.base.stageUpdatedAt");
    expect(form).toContain('initial={stageOption}');
    expect(options).toContain('screen-form-options/selected');
    expect(form).toContain("visibleTeamVersions");
  });

  it("treats labels as replaceable presentation, not selection authority", () => {
    const original = {
        id: "10000000-0000-4000-8000-000000000001",
        label: "Current status",
        target: {
          kind: "updated_at" as const,
          updatedAt: "2026-08-26T12:00:00.000Z",
        },
      },
      refreshed = { ...original, label: "Not contacted" };
    expect(optionIdentity(original)).toBe(optionIdentity(refreshed));
    expect(mergeOptions([original], [refreshed])).toEqual([refreshed]);
    expect(options).toContain('type="hidden"');
    expect(options).toContain("selectedOption ? optionValue(selectedOption)");
  });

  it("requires reconfirmation only for a changed token and clears only unavailable selections", () => {
    const old = {
        id: "10000000-0000-4000-8000-000000000001",
        label: "Not contacted",
        target: {
          kind: "updated_at" as const,
          updatedAt: "2026-08-26T12:00:00.000Z",
        },
      },
      changed = {
        ...old,
        label: "Contact attempted",
        target: {
          kind: "updated_at" as const,
          updatedAt: "2026-08-27T12:00:00.000Z",
        },
      },
      identity = optionIdentity(old);
    expect(
      reconcileOptionIdentity(identity, { outcome: "unchanged", current: old }),
    ).toEqual({ selectedIdentity: identity, replacement: null });
    expect(
      reconcileOptionIdentity(identity, { outcome: "changed", current: changed }),
    ).toEqual({ selectedIdentity: identity, replacement: changed });
    expect(
      reconcileOptionIdentity(identity, { outcome: "unavailable" }),
    ).toEqual({ selectedIdentity: "", replacement: null });
    expect(form).toContain("setSelectionConflict(error.selection)");
    expect(form).not.toContain('setStale(true);\n          setNotice(\n            "A selected option changed');
    expect(options).toContain("onAuthorityLoss()");
  });

  it("hydrates the selected stage directly even when it is outside the first page", () => {
    const selectedId = "10000000-0000-4000-8000-000000000099",
      params = selectedOptionParams({
        kind: "lead",
        optionKind: "lead_stage",
        item: {
          id: selectedId,
          target: {
            kind: "updated_at",
            updatedAt: "2026-08-26T12:00:00.000Z",
          },
        },
      });
    expect(params.get("id")).toBe(selectedId);
    expect(params.get("targetKind")).toBe("updated_at");
    expect(params.get("target")).toBe("2026-08-26T12:00:00.000Z");
    expect(params.has("cursor")).toBe(false);
    expect(params.has("limit")).toBe(false);
  });

  it("retains idempotency for an unchanged command and rotates after reconciliation changes it", () => {
    expect(form).toContain("if (request.current.body !== serialized)");
    expect(form).toContain(
      "request.current = { body: serialized, key: crypto.randomUUID() }",
    );
    expect(options).toContain("Use current {label.toLowerCase()}");
    expect(options).toContain('setSelectedIdentity("")');
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
