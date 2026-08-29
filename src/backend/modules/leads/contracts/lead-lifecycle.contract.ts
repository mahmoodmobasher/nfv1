import { z } from "zod";

export const LEAD_LIFECYCLE_TRANSITION_OPERATION = "lead-lifecycle-transition.v1" as const;
export const LEAD_LIFECYCLE_TRANSITION_RESULT = "lead-lifecycle-transition-result.v1" as const;

/**
 * The lead lifecycle state machine. This map is the ONLY definition of what may
 * follow what; the orchestrator, the presentation layer and the tests all read it.
 * Never widen it in a call site -- widen it here, with a test.
 *
 * new ──▶ working ──▶ qualified ──▶ converted (terminal)
 *  │         │            │
 *  └─────────┴────────────┴──▶ disqualified (terminal, reopenable to working)
 *
 * Deliberately absent:
 *  - new → qualified      every lead is picked up and worked first, so contact-attempt
 *                         rate stays an honest metric.
 *  - converted → *        converted leads are immutable history; correct the deal.
 *  - disqualified → qualified/converted  must be reopened to working and re-qualified.
 */
export const LEAD_LIFECYCLE_CODES = ["new", "working", "qualified", "disqualified", "converted"] as const;
export type LeadLifecycleCode = (typeof LEAD_LIFECYCLE_CODES)[number];

export const LEAD_LIFECYCLE_TERMINAL_CODES = ["converted"] as const;

export const ALLOWED_LEAD_LIFECYCLE_TRANSITIONS: Readonly<Record<LeadLifecycleCode, readonly LeadLifecycleCode[]>> = {
  new: ["working", "disqualified"],
  working: ["qualified", "disqualified"],
  qualified: ["working", "disqualified"],
  disqualified: ["working"],
  converted: [],
} as const;

/**
 * `qualified → converted` is intentionally NOT in the map above. Conversion creates a
 * deal and writes lead_deal_conversion_lineage, so it belongs to the conversion
 * orchestrator, which owns both writes in one transaction. This module never sets
 * `converted`.
 */

export const LEAD_DISQUALIFICATION_REASONS = ["not_a_fit", "no_response", "duplicate", "bad_data",
  "no_budget", "lost_to_competitor", "other"] as const;
export type LeadDisqualificationReason = (typeof LEAD_DISQUALIFICATION_REASONS)[number];

const uuid = z.string().uuid();
const version = z.number().int().positive();
const lifecycleCode = z.enum(LEAD_LIFECYCLE_CODES);

export const leadLifecycleTransitionCommandV1Schema = z.object({
  contractVersion: z.literal(LEAD_LIFECYCLE_TRANSITION_OPERATION),
  expectedVersion: version,
  targetLifecycle: lifecycleCode,
  disqualificationReason: z.enum(LEAD_DISQUALIFICATION_REASONS).nullable().default(null),
  disqualificationNote: z.string().trim().min(1).max(1000).nullable().default(null),
}).strict().superRefine((command, issue) => {
  if (command.targetLifecycle === "converted")
    issue.addIssue({ code: "custom", message: "conversion_is_not_a_lifecycle_transition", path: ["targetLifecycle"] });
  if (command.targetLifecycle === "disqualified" && !command.disqualificationReason)
    issue.addIssue({ code: "custom", message: "disqualification_reason_required", path: ["disqualificationReason"] });
  if (command.targetLifecycle !== "disqualified" && command.disqualificationReason)
    issue.addIssue({ code: "custom", message: "disqualification_reason_not_allowed", path: ["disqualificationReason"] });
  if (command.disqualificationReason === "other" && !command.disqualificationNote)
    issue.addIssue({ code: "custom", message: "disqualification_note_required", path: ["disqualificationNote"] });
  if (!command.disqualificationReason && command.disqualificationNote)
    issue.addIssue({ code: "custom", message: "disqualification_note_not_allowed", path: ["disqualificationNote"] });
});

export const leadLifecycleTransitionResultV1Schema = z.object({
  contractVersion: z.literal(LEAD_LIFECYCLE_TRANSITION_RESULT),
  leadId: uuid,
  leadVersion: version,
  lifecycle: z.object({
    code: lifecycleCode,
    previousCode: lifecycleCode,
    disqualificationReason: z.enum(LEAD_DISQUALIFICATION_REASONS).nullable(),
    reopenCount: z.number().int().min(0),
  }).strict(),
  changed: z.boolean(),
  replayed: z.boolean(),
  requestId: uuid,
  nextView: z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict(),
}).strict();

export type LeadLifecycleTransitionCommandV1 = z.infer<typeof leadLifecycleTransitionCommandV1Schema>;
export type LeadLifecycleTransitionResultV1 = z.infer<typeof leadLifecycleTransitionResultV1Schema>;

/** True when `to` may directly follow `from`. The single authority for the question. */
export function isAllowedLifecycleTransition(from: LeadLifecycleCode, to: LeadLifecycleCode) {
  return ALLOWED_LEAD_LIFECYCLE_TRANSITIONS[from].includes(to);
}
