import { z } from "zod";

export const LEAD_SUMMARIES_QUERY_V1 = "listLeadSummaries.v1" as const;
export const LEAD_DETAIL_QUERY_V1 = "getLeadDetail.v1" as const;
export const LEAD_PIPELINE_STAGES_QUERY_V1 = "listLeadPipelineStages.v1" as const;

const uuid = z.string().uuid();
const nullableBounded = (maximum: number) => z.string().max(maximum).nullable();
const maskedEmail = z.string().max(320).regex(/^.{1}\*{3}@[^@\s]{1,253}$/u).nullable();
const maskedPhone = z.string().max(7).regex(/^\*{3}\d{1,4}$/).nullable();
const sourceCategory = z.enum(["website", "referral", "outbound", "event", "partner", "social_media", "import", "manual", "other"]);
const sourcePlatform = z.enum(["tiktok", "instagram", "facebook", "linkedin", "x", "youtube", "other_social"]).nullable();
const sourceMedium = z.enum(["organic", "paid", "unknown"]);
const intakeChannel = z.enum(["web_form", "manual", "csv", "spreadsheet", "future_api", "future_integration"]);
const context = z.partialRecord(z.enum(["page", "account", "campaign", "ad", "form", "post", "operator_context", "platform_context"]), z.string().min(1).max(200));

export const leadSummaryItemV1Schema = z.object({
  leadId: uuid,
  displayName: z.string().min(1).max(200),
  structuredName: z.object({ firstName: nullableBounded(100), lastName: nullableBounded(100) }).strict(),
  contact: z.object({ contactId: uuid.nullable(), maskedEmail, maskedPhone }).strict(),
  company: z.object({ companyId: uuid.nullable(), displayName: nullableBounded(200) }).strict(),
  assignment: z.object({ responsibleMembershipId: uuid.nullable(), responsibleMembershipLabel: nullableBounded(200),
    responsibleTeamId: uuid.nullable(), responsibleTeamLabel: nullableBounded(200), isUnassigned: z.boolean() }).strict(),
  lifecycle: z.object({ code: nullableBounded(80), label: nullableBounded(120), status: z.enum(["open", "won", "lost"]) }).strict(),
  stage: z.object({ id: uuid, name: z.string().min(1).max(160), status: z.enum(["active", "archived"]) }).strict(),
  version: z.number().int().positive(),
  identityReviewStatus: z.enum(["not_required", "pending", "resolved"]),
  visibility: z.enum(["workspace", "teams"]),
  receivedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  originalAttribution: z.object({ sourceCategory, sourcePlatform, sourceMedium, sourceDetail: context,
    campaignContext: context, attributionContractVersion: z.string().min(1).max(80), intakeChannel }).strict(),
  capabilities: z.object({ canView: z.literal(true), canEdit: z.literal(false), canReview: z.boolean() }).strict(),
  nextView: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict(),
    z.object({ kind: z.literal("identity_review_detail"), leadId: uuid }).strict(),
  ]),
}).strict().superRefine((lead, issue) => {
  if (lead.nextView.leadId !== lead.leadId) issue.addIssue({ code: "custom", message: "navigation_identity_mismatch" });
  if (lead.capabilities.canReview !== (lead.identityReviewStatus === "pending" && lead.nextView.kind === "identity_review_detail"))
    issue.addIssue({ code: "custom", message: "review_capability_navigation_mismatch" });
});

export const leadSummariesViewV1Schema = z.object({
  contractVersion: z.literal(LEAD_SUMMARIES_QUERY_V1),
  requestId: uuid,
  items: z.array(leadSummaryItemV1Schema).max(50),
  nextCursor: z.string().max(1024).nullable(),
}).strict();

export const leadDetailViewV1Schema = z.object({
  contractVersion: z.literal(LEAD_DETAIL_QUERY_V1),
  requestId: uuid,
  lead: leadSummaryItemV1Schema,
}).strict();

export const leadPipelineStageV1Schema = z.object({ stageId: uuid, name: z.string().min(1).max(160),
  position: z.number().int().min(0), status: z.literal("active") }).strict();

export const leadPipelineStagesViewV1Schema = z.object({
  contractVersion: z.literal(LEAD_PIPELINE_STAGES_QUERY_V1),
  requestId: uuid,
  items: z.array(leadPipelineStageV1Schema).max(100),
}).strict().superRefine((view, issue) => {
  for (let index = 1; index < view.items.length; index++) {
    const previous = view.items[index - 1], current = view.items[index];
    if (previous.position > current.position || (previous.position === current.position && previous.stageId >= current.stageId))
      issue.addIssue({ code: "custom", message: "pipeline_stage_order_invalid", path: ["items", index] });
  }
});

export const leadSummaryFiltersV1Schema = z.object({
  q: z.string().trim().max(160).default(""),
  stageId: uuid.optional(),
  limit: z.number().int().min(1).max(50).default(50),
  cursor: z.string().max(1024).optional(),
}).strict();

export type LeadSummaryItemV1 = z.infer<typeof leadSummaryItemV1Schema>;
export type LeadSummariesViewV1 = z.infer<typeof leadSummariesViewV1Schema>;
export type LeadDetailViewV1 = z.infer<typeof leadDetailViewV1Schema>;
export type LeadPipelineStagesViewV1 = z.infer<typeof leadPipelineStagesViewV1Schema>;
export type LeadPipelineStageV1 = z.infer<typeof leadPipelineStageV1Schema>;
export type LeadSummaryFiltersV1 = z.infer<typeof leadSummaryFiltersV1Schema>;

const forbidden = new Set(["email", "phone", "emailNormalized", "phoneNormalized", "personNameNormalized", "requestHash", "idempotencyKey"]);
export function assertLeadPresentationSafe<T extends LeadSummariesViewV1 | LeadDetailViewV1>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.parse(value);
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      if (forbidden.has(key)) throw new Error("unsafe_lead_presentation");
      visit(child);
    }
  };
  visit(parsed);
  return parsed;
}
