import { describe, expect, it } from "vitest";
import {
  activeProductNavigation,
  navigationFromCapabilities,
} from "../src/app/product-navigation";
import {
  workspaceNavigationCapabilitiesV1Schema,
  workspaceNavigationErrorEnvelopeV1Schema,
} from "../src/frontend/shared/contracts/workspace-navigation";

const success = {
  contractVersion: "workspace-navigation-capabilities.v1",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  requestId: "10000000-0000-4000-8000-000000000002",
  capabilities: {
    home: { canView: true }, companies: { canView: true, canCreate: true },
    contacts: { canView: true, canCreate: true }, leads: { canView: true, canCreate: true },
    identityReview: { canView: true }, deals: { canView: true, canCreate: true },
    pipeline: { canView: true }, settings: { canViewPersonal: true, canViewWorkspace: true,
      canManagePeople: true, canManageInvitations: true, canManageTeams: true },
  },
} as const;

describe("NAV-01 frontend parity and route ownership", () => {
  it("strictly accepts the frozen success DTO and rejects unsafe combinations", () => {
    expect(workspaceNavigationCapabilitiesV1Schema.parse(success)).toEqual(success);
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse({ ...success, extra: true }).success).toBe(false);
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse({ ...success,
      capabilities: { ...success.capabilities, deals: { canView: false, canCreate: true } } }).success).toBe(false);
    expect(workspaceNavigationCapabilitiesV1Schema.safeParse({ ...success,
      capabilities: { ...success.capabilities, settings: { ...success.capabilities.settings,
        canViewWorkspace: false } } }).success).toBe(false);
  });

  it("strictly refines clearing and retry error outcomes", () => {
    expect(workspaceNavigationErrorEnvelopeV1Schema.safeParse({ error: {
      code: "authentication_required", message: "Sign in again.", retryable: false,
      reconciliation: { required: true, action: "clear_navigation_state" },
    }, requestId: success.requestId }).success).toBe(true);
    expect(workspaceNavigationErrorEnvelopeV1Schema.safeParse({ error: {
      code: "navigation_unavailable", message: "Try again.", retryable: false,
      reconciliation: { required: true, action: "retry_same_request" },
    }, requestId: success.requestId }).success).toBe(false);
  });

  it("keeps the exact IA order and excludes every deferred donor destination", () => {
    const groups = navigationFromCapabilities(success);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.label)])).toEqual([
      ["Home", ["Home"]],
      ["Contact Management", ["Companies", "Contacts"]],
      ["Sales", ["Leads", "Lead pipeline", "Deals", "Deal pipeline"]],
      ["Review", ["Identity review"]],
      ["Settings", ["Personal settings", "Workspace settings", "People and roles", "Invitations", "Teams"]],
    ]);
    expect(groups.flatMap((group) => group.items).map((item) => item.href).join(" "))
      .not.toMatch(/activity|calendar|routing|project|communication|insight|agent|pin/);
  });

  it.each([
    ["/crm", "Leads"], ["/crm/leads/new", "Leads"], ["/crm/leads/a", "Leads"],
    ["/crm/pipeline", "Lead pipeline"], ["/crm/deals", "Deals"],
    ["/crm/deals/a", "Deals"], ["/crm/deals/a/edit", "Deals"],
    ["/crm/deals/board", "Deal pipeline"], ["/crm/deals/board/more", "Deal pipeline"],
    ["/crm/companies/a/edit", "Companies"], ["/crm/contacts/a", "Contacts"],
  ])("selects one most-specific owner for %s", (pathname, label) => {
    const groups = navigationFromCapabilities(success), active = activeProductNavigation(pathname, groups);
    expect(active?.entry.label).toBe(label);
    const matches = groups.flatMap((group) => group.items)
      .filter((entry) => activeProductNavigation(pathname, [{ id: "one", label: "one", items: [entry] }]));
    if (label) expect(matches.filter((entry) => entry.label === label)).toHaveLength(1);
  });

  it("hides empty groups and create leaves when server capabilities are false", () => {
    const groups = navigationFromCapabilities({ ...success, capabilities: {
      ...success.capabilities, companies: { canView: false, canCreate: false },
      contacts: { canView: false, canCreate: false }, leads: { canView: true, canCreate: false },
      identityReview: { canView: false }, deals: { canView: false, canCreate: false },
      pipeline: { canView: false }, settings: { canViewPersonal: false, canViewWorkspace: false,
        canManagePeople: false, canManageInvitations: false, canManageTeams: false },
    } });
    expect(groups.map((group) => group.label)).toEqual(["Home", "Sales"]);
    expect(groups[1].items.map((entry) => entry.label)).toEqual(["Leads"]);
  });
});
