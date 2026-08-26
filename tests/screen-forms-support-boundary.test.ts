import { describe, expect, it } from "vitest";
import { donorFieldInventory } from "../src/frontend/features/screen-forms/testing/donor-field-inventory.fixtures";

describe("SCREEN-FORMS contract-neutral support", () => {
  it("keeps deterministic screenshot/donor labels in exact reading order", () => {
    expect(donorFieldInventory.company.flatMap((value) => value.labels)).toEqual([
      "Company name", "Domain", "Website", "Industry", "Size band", "Employees", "Annual revenue", "Parent Company",
      "Phone", "Street", "City", "State/Province", "Postal code", "Country",
    ]);
    expect(donorFieldInventory.lead[2].labels).toEqual(["Source", "Status", "Rating", "Industry", "Annual revenue", "Employees"]);
    expect(donorFieldInventory.contact.at(-1)?.labels.at(-1)).toBe("Add internal note");
  });

  it("contains labels only and cannot become a domain transport fixture", () => {
    const serialized = JSON.stringify(donorFieldInventory);
    expect(serialized).not.toMatch(/contractVersion|endpoint|capabilit|payload|schema|canCreate|stageId|companyId|membershipId|teamId|currencyCode/i);
    expect(serialized).not.toContain("AI Notes");
  });
});
