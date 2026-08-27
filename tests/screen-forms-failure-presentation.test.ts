import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  contactScreenCreateCommandV2Schema,
  screenFormsErrorEnvelopeV1Schema,
} from "../src/backend/modules/screen-forms/contracts/screen-forms.contract";
import {
  parseScreenCommand,
  screenFormsFailure,
} from "../src/backend/modules/screen-forms/presentation/screen-forms.route";

const requestId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const protectedContactId = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXAFLOW_REVISION;
});

describe("Screen Forms failure presentation", () => {
  it("logs only safe correlation and database classifications", async () => {
    process.env.NEXAFLOW_REVISION = "abcdef1234567890";
    const error = Object.assign(new Error("duplicate secret@example.test"), {
      code: "23505",
      constraint: "contact_identity_points_active_value_uq",
      detail: "secret@example.test",
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = screenFormsFailure(error, requestId, {
      request: new Request(
        `https://app.example.test/api/workspaces/${workspaceId}/contacts/${protectedContactId}/profile`,
        { method: "POST" },
      ),
      body: {
        contractVersion: "contact-screen-create.v2",
        primaryEmail: "secret@example.test",
      },
    });
    expect(response.status).toBe(500);
    expect(screenFormsErrorEnvelopeV1Schema.parse(await response.json()).error)
      .toMatchObject({ code: "unexpected_error", zeroPartialEffects: true });
    expect(logged).toHaveBeenCalledOnce();
    const line = String(logged.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({
      event: "screen_form_request_failed",
      requestId,
      route: "/api/workspaces/:id/contacts/:id/profile",
      operation: "contact-screen-create.v2",
      code: "unexpected_error",
      status: 500,
      revision: "abcdef1234567890",
      sqlState: "23505",
      constraint: "contact_identity_points_active_value_uq",
    });
    expect(line).not.toContain("secret@example.test");
    expect(line).not.toContain(workspaceId);
    expect(line).not.toContain(protectedContactId);
  });

  it("keeps screen and legacy Contact create presenters explicitly separated", () => {
    const route = readFileSync(
      "src/app/api/workspaces/[workspaceId]/contacts/route.ts",
      "utf8",
    );
    expect(route).toContain("version===CONTACT_SCREEN_CREATE_V2");
    expect(route).toContain("return screenFormsRoute(");
    expect(route).toContain("return graphRoute(");
    expect(route).toContain("parseScreenCommand(contactScreenCreateCommandV2Schema");
    expect(route).toContain("parsed(contactCreateCommandV1Schema");
  });

  it("presents duplicate Contact channels as linked validation fields", async () => {
    const command = {
      contractVersion: "contact-screen-create.v2",
      profile: {
        salutation: null,
        firstName: "Duplicate",
        lastName: "Contact",
        jobTitle: null,
        department: null,
        primaryEmail: "same@example.test",
        secondaryEmail: " SAME@example.test ",
        directPhone: "+14165550123",
        mobilePhone: " +14165550123 ",
        linkedinUrl: null,
        lifecycleStage: "lead",
        company: null,
        address: {
          street: null,
          city: null,
          stateProvince: null,
          postalCode: null,
          country: null,
        },
      },
      assignment: {
        responsibleMembershipId: null,
        responsibleMembershipVersion: null,
        responsibleTeamId: null,
        responsibleTeamVersion: null,
        visibility: "workspace",
        visibleTeamIds: [],
        visibleTeamVersions: {},
      },
    };
    let failure: unknown;
    try {
      parseScreenCommand(
        contactScreenCreateCommandV2Schema,
        command,
        "contact-screen-create.v2",
      );
    } catch (error) {
      failure = error;
    }
    const response = screenFormsFailure(failure, requestId);
    expect(response.status).toBe(400);
    const envelope = screenFormsErrorEnvelopeV1Schema.parse(await response.json());
    expect(envelope.error).toMatchObject({
      code: "validation_failed",
      zeroPartialEffects: true,
    });
    expect(envelope.error.fields).toEqual(expect.arrayContaining([
      "profile.primaryEmail",
      "profile.secondaryEmail",
      "profile.directPhone",
      "profile.mobilePhone",
    ]));
  });
});
