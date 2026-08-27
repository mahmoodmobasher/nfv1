import { describe, expect, it } from "vitest";
import { buildScreenFormCommand } from "../src/frontend/features/screen-forms/components/screen-form-command";
import { fieldId } from "../src/frontend/features/screen-forms/components/screen-form-fields";

function contactForm(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    firstName: "Ada",
    lastName: "Lovelace",
    primaryEmail: "ada@example.test",
    secondaryEmail: "",
    directPhone: "",
    mobilePhone: "",
    lifecycleStage: "lead",
    visibility: "workspace",
    ...overrides,
  })) data.set(name, value);
  return data;
}

describe("Contact screen command validation", () => {
  it("maps canonical server duplicate paths to the linked Contact controls", () => {
    expect([
      "profile.primaryEmail",
      "profile.secondaryEmail",
      "profile.directPhone",
      "profile.mobilePhone",
    ].map(fieldId)).toEqual([
      "primaryEmail",
      "secondaryEmail",
      "directPhone",
      "mobilePhone",
    ]);
  });

  it("links both normalized duplicate email and phone fields", () => {
    for (const editing of [false, true]) {
      const result = buildScreenFormCommand({
        kind: "contact",
        editing,
        expectedVersion: editing ? 2 : undefined,
        data: contactForm({
          primaryEmail: " Ada@Example.Test ",
          secondaryEmail: "ada@example.test",
          directPhone: " +14165550123 ",
          mobilePhone: "+14165550123",
        }),
      });
      expect(result).toEqual({
        success: false,
        errors: {
          primaryEmail: "Primary and secondary email must be different.",
          secondaryEmail: "Primary and secondary email must be different.",
          directPhone: "Direct and mobile phone must be different.",
          mobilePhone: "Direct and mobile phone must be different.",
        },
      });
    }
  });

  it("requires an explicit lifecycle choice for create and legacy-null edit", () => {
    for (const editing of [false, true]) {
      const result = buildScreenFormCommand({
        kind: "contact",
        editing,
        expectedVersion: editing ? 2 : undefined,
        data: contactForm({ lifecycleStage: "" }),
      });
      expect(result).toEqual({
        success: false,
        errors: { lifecycleStage: "Choose a lifecycle stage." },
      });
    }
  });

  it("keeps distinct normalized channels and a selected lifecycle in the strict command", () => {
    const result = buildScreenFormCommand({
      kind: "contact",
      editing: true,
      expectedVersion: 2,
      data: contactForm({
        secondaryEmail: "other@example.test",
        directPhone: "+14165550123",
        mobilePhone: "+14165550124",
        lifecycleStage: "customer",
      }),
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        contractVersion: "contact-screen-edit.v2",
        expectedVersion: 2,
        profile: { lifecycleStage: "customer" },
      });
  });
});
