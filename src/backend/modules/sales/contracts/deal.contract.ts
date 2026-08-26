import { z } from "zod";

export const SALES_DEAL_CREATE = "sales-deal-create.v1" as const,
  SALES_DEAL_UPDATE = "sales-deal-update.v1" as const,
  SALES_DEAL_STAGE_TRANSITION = "sales-deal-stage-transition.v1" as const,
  SALES_DEAL_LIFECYCLE = "sales-deal-lifecycle.v1" as const;
const uuid = z.string().uuid(),
  version = z.number().int().positive(),
  clean = (max: number) =>
    z
      .string()
      .trim()
      .min(1)
      .max(max)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
const money = z
  .object({
    amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
    currencyCode: z.enum(["USD", "CAD"]),
    currencyExponent: z.literal(2),
  })
  .strict()
  .nullable();
const assignment = {
  responsibleMembershipId: uuid,
  responsibleTeamId: uuid.nullable(),
  visibility: z.enum(["workspace", "teams"]),
  visibleTeamIds: z.array(uuid).max(20),
};
const parties = z
  .object({
    companyId: uuid,
    contacts: z
      .array(z.object({ contactId: uuid, isPrimary: z.boolean() }).strict())
      .max(20),
  })
  .strict();
function invariants(
  v: {
    visibility: "workspace" | "teams";
    visibleTeamIds: string[];
    responsibleTeamId: string | null;
    parties: { contacts: Array<{ contactId: string; isPrimary: boolean }> };
  },
  ctx: z.RefinementCtx,
) {
  if (new Set(v.visibleTeamIds).size !== v.visibleTeamIds.length)
    ctx.addIssue({
      code: "custom",
      message: "duplicate_visible_team",
      path: ["visibleTeamIds"],
    });
  if (
    (v.visibility === "workspace" && v.visibleTeamIds.length) ||
    (v.visibility === "teams" && !v.visibleTeamIds.length)
  )
    ctx.addIssue({
      code: "custom",
      message: "invalid_visible_team_set",
      path: ["visibleTeamIds"],
    });
  if (
    v.responsibleTeamId &&
    v.visibility === "teams" &&
    !v.visibleTeamIds.includes(v.responsibleTeamId)
  )
    ctx.addIssue({
      code: "custom",
      message: "responsible_team_must_be_visible",
      path: ["visibleTeamIds"],
    });
  if (
    new Set(v.parties.contacts.map((c) => c.contactId)).size !==
    v.parties.contacts.length
  )
    ctx.addIssue({
      code: "custom",
      message: "duplicate_contact",
      path: ["parties", "contacts"],
    });
  if (
    v.parties.contacts.length &&
    v.parties.contacts.filter((c) => c.isPrimary).length !== 1
  )
    ctx.addIssue({
      code: "custom",
      message: "one_primary_contact_required",
      path: ["parties", "contacts"],
    });
}
export const salesDealCreateCommandV1Schema = z
  .object({
    contractVersion: z.literal(SALES_DEAL_CREATE),
    pipelineId: uuid,
    stageId: uuid,
    name: clean(200),
    value: money,
    expectedCloseOn: z.string().date().nullable(),
    parties,
    ...assignment,
  })
  .strict()
  .superRefine(invariants);
export const salesDealUpdateCommandV1Schema = z
  .object({
    contractVersion: z.literal(SALES_DEAL_UPDATE),
    expectedVersion: version,
    name: clean(200),
    value: money,
    expectedCloseOn: z.string().date().nullable(),
    parties,
    ...assignment,
  })
  .strict()
  .superRefine(invariants);
export const salesDealStageTransitionCommandV1Schema = z
  .object({
    contractVersion: z.literal(SALES_DEAL_STAGE_TRANSITION),
    expectedVersion: version,
    targetStageId: uuid,
    lostReasonCode: z
      .enum([
        "budget",
        "timing",
        "no_decision",
        "competitor",
        "needs_mismatch",
        "other",
      ])
      .nullable(),
  })
  .strict();
export const salesDealLifecycleCommandV1Schema = z
  .object({
    contractVersion: z.literal(SALES_DEAL_LIFECYCLE),
    expectedVersion: version,
  })
  .strict();
export const salesDealListQueryV1Schema = z
  .object({
    lifecycle: z.enum(["active", "archived"]).default("active"),
    pipelineId: uuid.optional(),
    stageId: uuid.optional(),
    cursor: z.string().max(1024).optional(),
    limit: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const salesDealBoardQueryV1Schema = z
  .object({
    pipelineId: uuid.optional(),
    limitPerStage: z.number().int().min(1).max(25).default(10),
    stageCursors: z
      .record(uuid, z.string().max(1024))
      .refine(
        (value) => Object.keys(value).length <= 100,
        "too_many_stage_cursors",
      )
      .default({}),
  })
  .strict();
const option = z.object({ id: uuid, label: clean(200) }).strict(),
  stage = z
    .object({
      stageId: uuid,
      code: clean(64),
      label: clean(100),
      outcomeClass: z.enum(["open", "won", "lost"]),
      sortKey: z.number().int().nonnegative(),
      defaultProbabilityBps: z.number().int().min(0).max(10000),
      version,
    })
    .strict();
export const salesPipelineViewV1Schema = z
  .object({
    contractVersion: z.literal("sales-pipeline-view.v1"),
    pipeline: z
      .object({
        pipelineId: uuid,
        label: clean(100),
        configurationVersion: version,
        version,
        stages: z.array(stage).max(100),
      })
      .nullable(),
    options: z
      .object({
        responsibleMemberships: z.array(option).max(500),
        teams: z.array(option).max(100),
      })
      .strict(),
    capabilities: z
      .object({ canCreate: z.boolean(), canManageAssignment: z.boolean() })
      .strict(),
    requestId: uuid,
  })
  .strict();
const reconciliation = z
  .object({
    required: z.boolean(),
    action: z.enum([
      "none",
      "refetch_deal",
      "refetch_pipeline",
      "retry_same_request",
    ]),
  })
  .strict();
const minimizedParty = z.union([
  z
    .object({ available: z.literal(true), recordId: uuid, label: clean(200) })
    .strict(),
  z.object({ available: z.literal(false) }).strict(),
  z.null(),
]);
const dealSummary = z
  .object({
    dealId: uuid,
    name: clean(200),
    lifecycle: z.enum(["active", "archived"]),
    outcomeClass: z.enum(["open", "won", "lost"]),
    stageId: uuid,
    pipelineId: uuid,
    value: money,
    expectedCloseOn: z.string().date().nullable(),
    probabilityBps: z.number().int().min(0).max(10000),
    company: minimizedParty,
    primaryContact: minimizedParty,
    responsibleMembershipId: uuid,
    version,
    updatedAt: z.string().datetime({ offset: true }),
    capabilities: z
      .object({
        canEdit: z.boolean(),
        canTransition: z.boolean(),
        canArchive: z.boolean(),
        canRestore: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const salesDealListViewV1Schema = z
  .object({
    contractVersion: z.literal("sales-deal-list.v1"),
    filters: salesDealListQueryV1Schema.omit({ cursor: true, limit: true }),
    items: z.array(dealSummary).max(50),
    nextCursor: z.string().max(1024).nullable(),
    requestId: uuid,
  })
  .strict();
export const salesDealBoardViewV1Schema = z
  .object({
    contractVersion: z.literal("sales-deal-board.v1"),
    pipeline: z
      .object({
        pipelineId: uuid,
        label: clean(100),
        configurationVersion: version,
        version,
      })
      .strict(),
    filters: z.object({ pipelineId: uuid }).strict(),
    stages: z
      .array(
        stage
          .extend({
            items: z.array(dealSummary).max(25),
            nextCursor: z.string().max(1024).nullable(),
          })
          .strict(),
      )
      .max(100),
    requestId: uuid,
  })
  .strict();
const party = z.union([
  z
    .object({
      kind: z.literal("company"),
      companyId: uuid,
      label: clean(200),
      available: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("contact"),
      contactId: uuid,
      label: clean(200),
      isPrimary: z.boolean(),
      available: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["company", "contact"]),
      available: z.literal(false),
    })
    .strict(),
]);
export const salesDealDetailViewV1Schema = z
  .object({
    contractVersion: z.literal("sales-deal-detail.v1"),
    deal: z
      .object({
        dealId: uuid,
        name: clean(200),
        pipelineId: uuid,
        stageId: uuid,
        outcomeClass: z.enum(["open", "won", "lost"]),
        lifecycle: z.enum(["active", "archived"]),
        value: money,
        probabilityBps: z.number().int().min(0).max(10000),
        expectedCloseOn: z.string().date().nullable(),
        closedAt: z.string().datetime({ offset: true }).nullable(),
        lostReasonCode: z.string().nullable(),
        responsibleMembershipId: uuid,
        responsibleTeamId: uuid.nullable(),
        visibility: z.enum(["workspace", "teams"]),
        visibleTeamIds: z.array(uuid).max(20),
        parties: z.array(party).max(21),
        version,
        updatedAt: z.string().datetime({ offset: true }),
        capabilities: z
          .object({
            canEdit: z.boolean(),
            canTransition: z.boolean(),
            canArchive: z.boolean(),
            canRestore: z.boolean(),
            canManageAssignment: z.boolean(),
            eligibleTargetStageIds: z.array(uuid).max(100),
          })
          .strict(),
      })
      .strict(),
    pipeline: z
      .object({
        pipelineId: uuid,
        label: clean(100),
        stages: z.array(stage).max(100),
      })
      .strict(),
    options: z
      .object({
        responsibleMemberships: z.array(option).max(500),
        teams: z.array(option).max(100),
      })
      .strict(),
    requestId: uuid,
  })
  .strict();
export const salesDealResultV1Schema = z
  .object({
    contractVersion: z.literal("sales-deal-result.v1"),
    dealId: uuid,
    version,
    changed: z.boolean(),
    replayed: z.boolean(),
    stage: z
      .object({ stageId: uuid, outcomeClass: z.enum(["open", "won", "lost"]) })
      .strict(),
    requestId: uuid,
    reconciliation,
  })
  .strict();
export const salesErrorEnvelopeV1Schema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "authentication_required",
          "permission_required",
          "resource_not_found",
          "validation_failed",
          "unsupported_contract_version",
          "idempotency_conflict",
          "stale_version",
          "pipeline_unavailable",
          "stage_unavailable",
          "party_unavailable",
          "assignment_unavailable",
          "terminal_deal",
          "sales_unavailable",
          "unexpected_error",
        ]),
        message: clean(200),
        retryable: z.boolean(),
        reconciliation,
      })
      .strict(),
    requestId: uuid,
  })
  .strict();
export type SalesDealCreateCommandV1 = z.infer<
  typeof salesDealCreateCommandV1Schema
>;
export type SalesDealUpdateCommandV1 = z.infer<
  typeof salesDealUpdateCommandV1Schema
>;
export type SalesDealStageTransitionCommandV1 = z.infer<
  typeof salesDealStageTransitionCommandV1Schema
>;
export type SalesDealListQueryV1 = z.infer<typeof salesDealListQueryV1Schema>;
export type SalesDealBoardQueryV1 = z.infer<typeof salesDealBoardQueryV1Schema>;
export type SalesErrorCode =
  | "authentication_required"
  | "permission_required"
  | "resource_not_found"
  | "validation_failed"
  | "unsupported_contract_version"
  | "idempotency_conflict"
  | "stale_version"
  | "pipeline_unavailable"
  | "stage_unavailable"
  | "party_unavailable"
  | "assignment_unavailable"
  | "terminal_deal"
  | "sales_unavailable"
  | "unexpected_error";
export class SalesError extends Error {
  constructor(
    public code: SalesErrorCode,
    public status: number,
  ) {
    super(code);
  }
}
