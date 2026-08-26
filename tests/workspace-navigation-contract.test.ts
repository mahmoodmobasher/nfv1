import { describe, expect, it } from "vitest";
import {
  WORKSPACE_NAVIGATION_ROUTE_CAPABILITIES_V1,
  workspaceNavigationCapabilitiesV1Schema,
  workspaceNavigationErrorEnvelopeV1Schema,
} from "../src/backend/modules/navigation";

const id = () => crypto.randomUUID();

function capabilities() {
  return {
    contractVersion: "workspace-navigation-capabilities.v1" as const,
    workspaceId: id(),
    capabilities: {
      home: { canView: true as const },
      companies: { canView: true, canCreate: false },
      contacts: { canView: true, canCreate: false },
      leads: { canView: true, canCreate: false },
      identityReview: { canView: false },
      deals: { canView: true, canCreate: false },
      pipeline: { canView: true },
      settings: {
        canViewPersonal: true,
        canViewWorkspace: false,
        canManagePeople: false,
        canManageInvitations: false,
        canManageTeams: false,
      },
    },
    requestId: id(),
  };
}

describe("NAV-01 strict transport", () => {
  it("requires every create destination to retain its owning view", () => {
    for (const kind of ["companies", "contacts", "leads", "deals"] as const) {
      const value = capabilities();
      value.capabilities[kind] = { canView: false, canCreate: true };
      expect(workspaceNavigationCapabilitiesV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("requires Workspace settings view for every Workspace management leaf", () => {
    for (const key of ["canManagePeople", "canManageInvitations", "canManageTeams"] as const) {
      const value = capabilities();
      value.capabilities.settings[key] = true;
      expect(workspaceNavigationCapabilitiesV1Schema.safeParse(value).success).toBe(false);
    }
    const personalOnly = capabilities();
    expect(workspaceNavigationCapabilitiesV1Schema.parse(personalOnly).capabilities.settings)
      .toMatchObject({ canViewPersonal: true, canViewWorkspace: false });
  });

  it("freezes distinct Sales and Lead pipeline route authority", () => {
    expect(WORKSPACE_NAVIGATION_ROUTE_CAPABILITIES_V1).toMatchObject({
      leads: { href: "/crm", capability: "leads.canView" },
      addLead: { href: "/crm/leads/new", capability: "leads.canCreate" },
      deals: { href: "/crm/deals", capability: "deals.canView" },
      dealPipeline: { href: "/crm/deals/board", capability: "deals.canView" },
      leadPipeline: { href: "/crm/pipeline", capability: "pipeline.canView" },
      identityReview: {
        href: "/crm/identity-reviews",
        capability: "identityReview.canView",
      },
      personalSettings: {
        href: "/settings",
        capability: "settings.canViewPersonal",
      },
      workspaceSettings: {
        href: "/workspace/settings",
        capability: "settings.canViewWorkspace",
      },
    });
  });

  it("requires a complete strict envelope, literal Home, and UUID identities", () => {
    expect(workspaceNavigationCapabilitiesV1Schema.parse(capabilities()).capabilities.home.canView).toBe(true);
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse({ ...capabilities(), extra: true }).success).toBe(false);
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse({ ...capabilities(), workspaceId: "wrong" }).success).toBe(false);
    const missingLeaf = capabilities() as Record<string, unknown>;
    const nested = (missingLeaf.capabilities as Record<string, unknown>);
    delete nested.contacts;
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse(missingLeaf).success).toBe(false);
  });

  it("freezes fail-closed auth/resource errors and retry-only unavailability", () => {
    const base = {
      error: {
        code: "resource_not_found" as const,
        message: "Workspace is unavailable.",
        retryable: false,
        reconciliation: { required: true as const, action: "clear_navigation_state" as const },
      },
      requestId: id(),
    };
    expect(workspaceNavigationErrorEnvelopeV1Schema.parse(base)).toEqual(base);
    expect(workspaceNavigationErrorEnvelopeV1Schema.safeParse({
      ...base,
      error: { ...base.error, retryable: true },
    }).success).toBe(false);
    expect(workspaceNavigationErrorEnvelopeV1Schema.safeParse({
      ...base,
      error: {
        ...base.error,
        code: "navigation_unavailable",
        retryable: true,
        reconciliation: { required: true, action: "retry_same_request" },
      },
    }).success).toBe(true);
  });
});
