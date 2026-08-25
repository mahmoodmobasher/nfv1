import type { Pool } from "pg";
import type { TrustedActor } from "@/backend/platform/authorization";
import { leadInquiryIntakeCommandV1Schema, LeadIntakeError, type LeadInquiryIntakeCommandV1, type LegacyLeadCreateV1 } from "../../contracts/lead-inquiry-intake.contract";
import { orchestrateManualLeadInquiryV1 } from "../orchestrators/submit-lead-inquiry.orchestrator";

export async function submitLeadInquiryV1(pool: Pool, input: { actor: TrustedActor; command: LeadInquiryIntakeCommandV1; idempotencyKey: string; requestId?: string }) {
  const parsed = leadInquiryIntakeCommandV1Schema.safeParse(input.command);
  if (!parsed.success) throw new LeadIntakeError("validation_failed", 400, { fields: parsed.error.issues.map(issue => issue.path.join(".")) });
  return orchestrateManualLeadInquiryV1(pool, { ...input, command: parsed.data });
}

export async function submitLegacyManualLeadV1(pool: Pool, input: { actor: TrustedActor; legacy: LegacyLeadCreateV1; idempotencyKey: string; requestId?: string }) {
  const receivedAt = new Date().toISOString();
  const command = leadInquiryIntakeCommandV1Schema.parse({
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: `${input.legacy.firstName} ${input.legacy.lastName}`, firstName: input.legacy.firstName,
      lastName: input.legacy.lastName, email: input.legacy.email, ...(input.legacy.phone?.trim() ? { phone: input.legacy.phone } : {}) },
    organization: { name: input.legacy.company }, inquiry: { receivedAt },
    source: { sourceCategory: input.legacy.source, sourceMedium: "unknown", attributionContractVersion: "p1a-attribution-v1" },
    requestedAssignment: input.legacy.ownerMembershipId ? { membershipId: input.legacy.ownerMembershipId } : undefined,
  });
  return orchestrateManualLeadInquiryV1(pool, { actor: input.actor, command, idempotencyKey: input.idempotencyKey,
    requestId: input.requestId, compatibility: { stageId: input.legacy.stageId, visibility: input.legacy.visibility,
      teamIds: input.legacy.teamIds, note: input.legacy.note } });
}
