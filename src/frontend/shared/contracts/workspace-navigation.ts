import { z } from "zod";

export const WORKSPACE_NAVIGATION_CAPABILITIES_V1 =
  "workspace-navigation-capabilities.v1" as const;

const uuid = z.string().uuid();
const view = z.object({ canView: z.boolean() }).strict();
const creatable = z.object({ canView: z.boolean(), canCreate: z.boolean() }).strict();
const settings = z.object({
  canViewPersonal: z.boolean(), canViewWorkspace: z.boolean(),
  canManagePeople: z.boolean(), canManageInvitations: z.boolean(), canManageTeams: z.boolean(),
}).strict();

export const workspaceNavigationCapabilitiesV1Schema = z.object({
  contractVersion: z.literal(WORKSPACE_NAVIGATION_CAPABILITIES_V1),
  workspaceId: uuid,
  capabilities: z.object({
    home: z.object({ canView: z.literal(true) }).strict(),
    companies: creatable, contacts: creatable, leads: creatable,
    identityReview: view, deals: creatable, pipeline: view, settings,
  }).strict(),
  requestId: uuid,
}).strict().superRefine((value, context) => {
  for (const key of ["companies", "contacts", "leads", "deals"] as const) {
    const capability = value.capabilities[key];
    if (capability.canCreate && !capability.canView)
      context.addIssue({ code: "custom", message: "create_requires_view", path: ["capabilities", key] });
  }
  const valueSettings = value.capabilities.settings;
  if ((valueSettings.canManagePeople || valueSettings.canManageInvitations || valueSettings.canManageTeams) && !valueSettings.canViewWorkspace)
    context.addIssue({ code: "custom", message: "manage_requires_workspace_settings", path: ["capabilities", "settings"] });
});

const navigationError = z.object({
  code: z.enum(["authentication_required", "resource_not_found", "navigation_unavailable"]),
  message: z.string().trim().min(1).max(200), retryable: z.boolean(),
  reconciliation: z.object({
    required: z.literal(true),
    action: z.enum(["clear_navigation_state", "retry_same_request"]),
  }).strict(),
}).strict();

export const workspaceNavigationErrorEnvelopeV1Schema = z.object({
  error: navigationError, requestId: uuid,
}).strict().superRefine((value, context) => {
  const unavailable = value.error.code === "navigation_unavailable";
  if (value.error.retryable !== unavailable ||
    value.error.reconciliation.action !== (unavailable ? "retry_same_request" : "clear_navigation_state"))
    context.addIssue({ code: "custom", message: "invalid_navigation_reconciliation", path: ["error"] });
});

export type WorkspaceNavigationCapabilitiesV1 = z.infer<typeof workspaceNavigationCapabilitiesV1Schema>;
export type WorkspaceNavigationErrorEnvelopeV1 = z.infer<typeof workspaceNavigationErrorEnvelopeV1Schema>;
