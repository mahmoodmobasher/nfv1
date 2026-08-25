import type { Pool } from "pg";
import type { TrustedActor } from "@/backend/platform/authorization";
import { leadInquiryIntakeCommandV1Schema, LeadIntakeError, type LeadInquiryIntakeCommandV1, type LegacyLeadCreateV1 } from "../../contracts/lead-inquiry-intake.contract";
import { orchestrateManualLeadInquiryV1 } from "../orchestrators/submit-lead-inquiry.orchestrator";
import { canonicalizeIntake } from "../../domain/lead-attribution.domain";
import { PersonPhoneValidationError } from "../../domain/person-phone.domain";

function validatedIntake(command: LeadInquiryIntakeCommandV1) {
  try { return canonicalizeIntake(command); }
  catch (error) {
    if (error instanceof PersonPhoneValidationError) {
      throw new LeadIntakeError("validation_failed", 400, { fields: error.fields });
    }
    throw error;
  }
}

export async function submitLeadInquiryV1(pool: Pool, input: { actor: TrustedActor; command: LeadInquiryIntakeCommandV1; idempotencyKey: string; requestId?: string }) {
  const raw = input.command as unknown as Record<string, unknown>;
  if (raw.contractVersion !== "lead-inquiry-intake.v1") throw new LeadIntakeError("unsupported_contract_version", 400);
  const parsed = leadInquiryIntakeCommandV1Schema.safeParse(input.command);
  if (!parsed.success) {
    const issue = parsed.error.issues[0], path = issue?.path.join(".") ?? "";
    const custom = issue?.message;
    const code = custom === "source_platform_required" || custom === "source_platform_not_allowed" ? custom
      : path === "source.sourceCategory" ? "invalid_source_category"
      : path === "source.sourcePlatform" ? "invalid_source_platform"
      : path === "source.sourceMedium" ? "invalid_source_medium"
      : custom !== "source_detail_required" && (path.startsWith("source.sourceDetail") || path.startsWith("source.campaignContext")) ? "source_detail_too_large"
      : "validation_failed";
    throw new LeadIntakeError(code, 400, { fields: parsed.error.issues.map(item => item.path.join(".")) });
  }
  return orchestrateManualLeadInquiryV1(pool, { ...input, command: parsed.data, normalized: validatedIntake(parsed.data) });
}

export async function submitLegacyManualLeadV1(pool: Pool, input: { actor: TrustedActor; legacy: LegacyLeadCreateV1; idempotencyKey: string; requestId?: string }) {
  const receivedAt = new Date().toISOString();
  const command = leadInquiryIntakeCommandV1Schema.parse({
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: `${input.legacy.firstName} ${input.legacy.lastName}`, firstName: input.legacy.firstName,
      lastName: input.legacy.lastName, email: input.legacy.email,
      ...(input.legacy.phone?.trim() ? { phone: input.legacy.phone, phoneCountryOverride: "CA" as const } : {}) },
    organization: { name: input.legacy.company }, inquiry: { receivedAt },
    source: { sourceCategory: input.legacy.source, sourceMedium: "unknown", attributionContractVersion: "p1a-attribution-v1" },
    requestedAssignment: input.legacy.ownerMembershipId ? { membershipId: input.legacy.ownerMembershipId } : undefined,
  });
  return orchestrateManualLeadInquiryV1(pool, { actor: input.actor, command, normalized: validatedIntake(command), idempotencyKey: input.idempotencyKey,
    requestId: input.requestId, compatibility: { stageId: input.legacy.stageId, visibility: input.legacy.visibility,
      teamIds: input.legacy.teamIds, note: input.legacy.note } });
}
