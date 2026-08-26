import { describe, expect, it } from "vitest";
import {
  leadConversionPreviewV1Schema,
  leadConvertToDealCommandV1Schema,
} from "../src/backend/modules/leads";
import {
  leadConversionFailure,
  leadConversionJson,
} from "../src/backend/modules/leads/presentation/lead-conversion.http";
import { POST as convertRoute } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/convert/route";

const id = () => crypto.randomUUID();

function command() {
  const responsibleTeamId = id();
  return {
    contractVersion: "lead-convert-to-deal.v1",
    expectedLeadVersion: 4,
    intakeId: id(),
    expectedIntakeVersion: 1,
    review: {
      reviewId: id(),
      reviewVersion: 2,
      decisionHeadId: id(),
      decisionHeadVersion: 1,
    },
    company: { companyId: id(), expectedVersion: 1 },
    primaryContact: null,
    pipeline: {
      pipelineId: id(),
      expectedVersion: 1,
      expectedConfigurationVersion: 1,
      stageId: id(),
      expectedStageVersion: 1,
    },
    deal: { name: "Qualified opportunity", value: null, expectedCloseOn: null },
    assignment: {
      responsibleMembershipId: id(),
      responsibleTeamId,
      visibility: "teams",
      visibleTeamIds: [responsibleTeamId],
    },
  };
}

describe("LEAD-CONVERSION-01 strict transport", () => {
  it("requires the resolved review/head token in every command", () => {
    const valid = command();
    expect(leadConvertToDealCommandV1Schema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      leadConvertToDealCommandV1Schema.safeParse({ ...valid, review: null })
        .success,
    ).toBe(false);
  });

  it("requires eligible previews to carry the resolved review token", () => {
    const value = command();
    const preview = {
      contractVersion: "lead-conversion-preview.v1",
      lead: {
        leadId: id(),
        label: "Qualified Lead",
        lifecycle: "qualified",
        legacyStatus: "open",
        version: value.expectedLeadVersion,
        intakeId: value.intakeId,
        intakeVersion: value.expectedIntakeVersion,
        review: null,
      },
      eligible: true,
      ineligibilityReasons: [],
      capabilities: { canConvert: true },
      choices: { companies: [], primaryContacts: [] },
      pipeline: null,
      dealDefaults: {
        name: "Qualified Lead",
        value: null,
        expectedCloseOn: null,
      },
      assignment: value.assignment,
      effects: {
        createsDeal: true,
        createsCustomers: false,
        createsDeliveryProject: false,
        writesLineage: true,
        convertsCanonicalLeadLifecycle: true,
        preservesLegacyLeadStatus: true,
      },
      requestId: id(),
    };
    expect(leadConversionPreviewV1Schema.safeParse(preview).success).toBe(
      false,
    );
    expect(
      leadConversionPreviewV1Schema.safeParse({
        ...preview,
        eligible: false,
        ineligibilityReasons: ["identity_review_unresolved"],
        capabilities: { canConvert: false },
      }).success,
    ).toBe(true);
  });

  it("requires the responsible Team in the bounded visible Team set", () => {
    const value = command();
    expect(
      leadConvertToDealCommandV1Schema.safeParse({
        ...value,
        assignment: { ...value.assignment, visibleTeamIds: [id()] },
      }).success,
    ).toBe(false);
  });

  it("keeps all successes and errors private and strips thrown detail", async () => {
    expect(leadConversionJson({ ok: true }).headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    const response = leadConversionFailure(
      Object.assign(new Error("secret@example.test"), {
        code: "selection_unavailable",
        status: 409,
      }),
      id(),
    );
    expect(response.headers.get("vary")).toBe("cookie");
    expect(await response.text()).not.toContain("secret@example.test");
  });

  it("returns origin rejection through the strict private conversion envelope", async () => {
    const response = await convertRoute(
      new Request("http://localhost/api/workspaces/a/leads/b/convert", {
        method: "POST",
        headers: {
          origin: "https://attacker.invalid",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ workspaceId: id(), leadId: id() }) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "permission_required",
        reconciliation: { action: "clear_conversion_state" },
        guarantees: { zeroPartialEffects: true },
      },
    });
  });
});
