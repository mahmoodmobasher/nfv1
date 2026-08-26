import { z } from "zod";

export const WORKSPACE_NAVIGATION_CAPABILITIES_V1 =
  "workspace-navigation-capabilities.v1" as const;

/**
 * Product-owned shell placement is intentionally not serialized by the
 * capability endpoint. This frozen map lets consumers bind the implemented
 * routes to server-issued authority without inferring authority using labels,
 * paths, or role strings.
 *
 * `deals.canView` governs both Sales list and board. `pipeline.canView` is
 * exclusively the legacy Lead pipeline. Add Lead remains independent of
 * Identity Review and is governed by `leads.canCreate`.
 */
export const WORKSPACE_NAVIGATION_ROUTE_CAPABILITIES_V1 = {
  home: { href: "/crm/home", capability: "home.canView" },
  companies: { href: "/crm/companies", capability: "companies.canView" },
  contacts: { href: "/crm/contacts", capability: "contacts.canView" },
  leads: { href: "/crm", capability: "leads.canView" },
  addLead: { href: "/crm/leads/new", capability: "leads.canCreate" },
  identityReview: {
    href: "/crm/identity-reviews",
    capability: "identityReview.canView",
  },
  deals: { href: "/crm/deals", capability: "deals.canView" },
  dealPipeline: { href: "/crm/deals/board", capability: "deals.canView" },
  leadPipeline: { href: "/crm/pipeline", capability: "pipeline.canView" },
  personalSettings: {
    href: "/settings",
    capability: "settings.canViewPersonal",
  },
  workspaceSettings: {
    href: "/workspace/settings",
    capability: "settings.canViewWorkspace",
  },
  people: {
    href: "/workspace/settings/people",
    capability: "settings.canManagePeople",
  },
  invitations: {
    href: "/workspace/settings/invitations",
    capability: "settings.canManageInvitations",
  },
  teams: {
    href: "/workspace/settings/teams",
    capability: "settings.canManageTeams",
  },
} as const;

const uuid = z.string().uuid();
const viewCreate = z
  .object({ canView: z.boolean(), canCreate: z.boolean() })
  .strict();

export const workspaceNavigationCapabilitiesV1Schema = z
  .object({
    contractVersion: z.literal(WORKSPACE_NAVIGATION_CAPABILITIES_V1),
    workspaceId: uuid,
    capabilities: z
      .object({
        home: z.object({ canView: z.literal(true) }).strict(),
        companies: viewCreate,
        contacts: viewCreate,
        leads: viewCreate,
        identityReview: z.object({ canView: z.boolean() }).strict(),
        deals: viewCreate,
        pipeline: z.object({ canView: z.boolean() }).strict(),
        settings: z
          .object({
            canViewPersonal: z.boolean(),
            canViewWorkspace: z.boolean(),
            canManagePeople: z.boolean(),
            canManageInvitations: z.boolean(),
            canManageTeams: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    requestId: uuid,
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of ["companies", "contacts", "leads", "deals"] as const) {
      const capability = value.capabilities[key];
      if (capability.canCreate && !capability.canView)
        context.addIssue({ code: "custom", message: "create_requires_view", path: ["capabilities", key] });
    }
    const settings = value.capabilities.settings;
    if (
      (settings.canManagePeople || settings.canManageInvitations || settings.canManageTeams) &&
      !settings.canViewWorkspace
    )
      context.addIssue({ code: "custom", message: "manage_requires_workspace_settings", path: ["capabilities", "settings"] });
  });

export const workspaceNavigationErrorEnvelopeV1Schema = z
  .object({
    error: z
      .object({
        code: z.enum(["authentication_required", "resource_not_found", "navigation_unavailable"]),
        message: z.string().trim().min(1).max(200),
        retryable: z.boolean(),
        reconciliation: z
          .object({
            required: z.literal(true),
            action: z.enum(["clear_navigation_state", "retry_same_request"]),
          })
          .strict(),
      })
      .strict(),
    requestId: uuid,
  })
  .strict()
  .superRefine((value, context) => {
    const unavailable = value.error.code === "navigation_unavailable";
    if (
      value.error.retryable !== unavailable ||
      value.error.reconciliation.action !== (unavailable ? "retry_same_request" : "clear_navigation_state")
    )
      context.addIssue({ code: "custom", message: "invalid_navigation_reconciliation", path: ["error"] });
  });

export type WorkspaceNavigationCapabilitiesV1 = z.infer<typeof workspaceNavigationCapabilitiesV1Schema>;
export type WorkspaceNavigationErrorEnvelopeV1 = z.infer<typeof workspaceNavigationErrorEnvelopeV1Schema>;
