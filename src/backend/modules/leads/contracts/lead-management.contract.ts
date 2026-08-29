import { z } from "zod";

export const GET_LEAD_OPERATIONAL_EDIT_QUERY = "getLeadOperationalEdit.v1" as const;
export const LEAD_OPERATIONAL_EDIT_OPERATION = "lead-operational-edit.v1" as const;
export const LEAD_STAGE_TRANSITION_OPERATION = "lead-stage-transition.v1" as const;
export const LEAD_OPERATIONAL_EDIT_RESULT = "lead-operational-edit-result.v1" as const;
export const LEAD_STAGE_TRANSITION_RESULT = "lead-stage-transition-result.v1" as const;

const uuid = z.string().uuid();
const version = z.number().int().positive();
const visibility = z.enum(["workspace", "teams"]);
const option = z.object({ id: uuid, label: z.string().min(1).max(200) }).strict();
const operationalFields = z.object({
  responsibleMembershipId: uuid.nullable(),
  responsibleTeamId: uuid.nullable(),
  visibility,
  visibleTeamIds: z.array(uuid).max(100),
}).strict();

export const leadOperationalEditCommandV1Schema = operationalFields.extend({
  contractVersion: z.literal(LEAD_OPERATIONAL_EDIT_OPERATION),
  expectedVersion: version,
}).strict().superRefine((command, issue) => {
  if (new Set(command.visibleTeamIds).size !== command.visibleTeamIds.length)
    issue.addIssue({ code: "custom", message: "duplicate_visible_team", path: ["visibleTeamIds"] });
  if (command.visibility === "teams" && command.visibleTeamIds.length === 0)
    issue.addIssue({ code: "custom", message: "visible_team_required", path: ["visibleTeamIds"] });
  if (command.visibility === "teams" && command.responsibleTeamId && !command.visibleTeamIds.includes(command.responsibleTeamId))
    issue.addIssue({ code: "custom", message: "responsible_team_must_be_visible", path: ["visibleTeamIds"] });
});

export const leadStageTransitionCommandV1Schema = z.object({
  contractVersion: z.literal(LEAD_STAGE_TRANSITION_OPERATION),
  expectedVersion: version,
  targetStageId: uuid,
}).strict();

export const leadOperationalEditViewV1Schema = z.object({
  contractVersion: z.literal(GET_LEAD_OPERATIONAL_EDIT_QUERY),
  requestId: uuid,
  leadId: uuid,
  version,
  operational: operationalFields,
  options: z.object({ responsibleMemberships: z.array(option).max(500), teams: z.array(option).max(100) }).strict(),
  capabilities: z.object({ canEditLead: z.boolean() }).strict(),
  nextView: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("lead_edit"), leadId: uuid }).strict(),
    z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict(),
  ]),
}).strict().superRefine((view, issue) => {
  if (view.nextView.leadId !== view.leadId)
    issue.addIssue({ code: "custom", message: "navigation_identity_mismatch", path: ["nextView"] });
  if (view.capabilities.canEditLead !== (view.nextView.kind === "lead_edit"))
    issue.addIssue({ code: "custom", message: "edit_capability_navigation_mismatch", path: ["capabilities"] });
  if (!view.capabilities.canEditLead && (view.options.responsibleMemberships.length || view.options.teams.length))
    issue.addIssue({ code: "custom", message: "unauthorized_option_disclosure", path: ["options"] });
});

export const leadOperationalEditResultV1Schema = z.object({
  contractVersion: z.literal(LEAD_OPERATIONAL_EDIT_RESULT),
  leadId: uuid,
  leadVersion: version,
  operational: operationalFields,
  changed: z.literal(true),
  replayed: z.boolean(),
  requestId: uuid,
  nextView: z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict(),
}).strict();

export const leadStageTransitionResultV1Schema = z.object({
  contractVersion: z.literal(LEAD_STAGE_TRANSITION_RESULT),
  leadId: uuid,
  leadVersion: version,
  stage: z.object({ stageId: uuid, name: z.string().min(1).max(160), position: z.number().int().min(0) }).strict(),
  changed: z.boolean(),
  replayed: z.boolean(),
  requestId: uuid,
  nextView: z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict(),
}).strict();

const leadManagementErrorCodeSchema = z.enum(["authentication_required", "permission_required", "resource_not_found",
  "validation_failed", "unsupported_contract_version", "idempotency_conflict", "stale_version", "stage_unavailable",
  "assignment_unavailable", "lifecycle_transition_not_allowed", "lifecycle_unavailable", "rate_limited",
  "lead_mutation_unavailable", "unexpected_error"]);
const leadManagementReconciliationActionSchema = z.enum(["none", "refetch_lead", "refetch_lead_and_stages",
  "refetch_lead_operational_edit", "retry_same_request"]);
export const leadManagementErrorEnvelopeV1Schema = z.object({ error: z.object({ code: leadManagementErrorCodeSchema,
  message: z.string().min(1).max(200), retryable: z.boolean(), reconciliation: z.object({ required: z.boolean(),
    action: leadManagementReconciliationActionSchema }).strict(), details: z.object({ fields: z.array(z.enum([
      "contractVersion", "expectedVersion", "responsibleMembershipId", "responsibleTeamId", "visibility", "visibleTeamIds",
      "targetStageId", "targetLifecycle", "disqualificationReason", "disqualificationNote",
      "idempotencyKey"])).max(16) }).strict().optional() }).strict(), requestId: uuid }).strict();

export type LeadOperationalEditCommandV1 = z.infer<typeof leadOperationalEditCommandV1Schema>;
export type LeadStageTransitionCommandV1 = z.infer<typeof leadStageTransitionCommandV1Schema>;
export type LeadOperationalEditViewV1 = z.infer<typeof leadOperationalEditViewV1Schema>;
export type LeadOperationalEditResultV1 = z.infer<typeof leadOperationalEditResultV1Schema>;
export type LeadStageTransitionResultV1 = z.infer<typeof leadStageTransitionResultV1Schema>;
export type LeadManagementErrorEnvelopeV1 = z.infer<typeof leadManagementErrorEnvelopeV1Schema>;

export type LeadManagementErrorCode = "authentication_required" | "permission_required" | "resource_not_found" |
  "validation_failed" | "unsupported_contract_version" | "idempotency_conflict" | "stale_version" |
  "stage_unavailable" | "assignment_unavailable" | "lifecycle_transition_not_allowed" | "lifecycle_unavailable" |
  "rate_limited" | "lead_mutation_unavailable" | "unexpected_error";

export class LeadManagementError extends Error {
  constructor(public code: LeadManagementErrorCode, public status: number, public safe?: unknown) { super(code); }
}
