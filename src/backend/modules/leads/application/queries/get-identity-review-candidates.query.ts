import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { assertIdentityReviewPresentationSafe, identityReviewTransactionParticipant, type IdentityReviewCandidateViewV1,
  type IdentityReviewCapabilitiesV1 } from "@/backend/modules/identity-review";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";

// Read trace: protected detail; active assigned-visible pending population; Lead/evidence/identity owner participants;
// <=10 per evidence class/<=30 total; masked allowlist; private/no-store route; indexed exact lookups; p95 target <200 ms.

function maskEmail(value?: string | null) {
  if (!value) return null;
  const at = value.indexOf("@");
  return at < 1 ? "***" : `${value[0]}***${value.slice(at)}`;
}

function maskPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? `***${digits.slice(-4)}` : "***";
}

export function identityReviewCapabilities(actor: TrustedActor, input: {
  hasCompany: boolean; contactCandidates: boolean; companyCandidates: boolean; current: boolean;
}): IdentityReviewCapabilitiesV1 {
  const pending = input.current, canLink = pending && actor.role !== "member";
  return { canCreateContact: pending, canCreateCompany: pending && input.hasCompany,
    canLinkContact: canLink && input.contactCandidates, canLinkCompany: canLink && input.companyCandidates,
    canDismiss: pending, canHold: true, canResolve: pending };
}

export async function getIdentityReviewCandidatesV1(pool: Pool, actor: TrustedActor, leadId: string,
  requestId: string = randomUUID()): Promise<IdentityReviewCandidateViewV1> {
  return runModuleTransaction(pool, async tx => {
    const current = await revalidateActiveActor(tx, actor), reviews = identityReviewTransactionParticipant(tx);
    const review = await reviews.findByLead(current.workspaceId, leadId);
    if (review.state !== "pending") throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const lead = await leadTransactionParticipant(tx).readIntakeLeadContext(current.workspaceId, review.intake_id, review.lead_id);
    if (!(await workspaceAuthorityParticipant(tx).canDiscloseLead(current, lead)))
      throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const evidence = await reviews.evidence(current.workspaceId, review.id);
    const contactIds = evidence.flatMap(item => item.contactId ? [String(item.contactId)] : []);
    const companyIds = evidence.flatMap(item => item.companyId ? [String(item.companyId)] : []);
    const contacts = new Map((await contactTransactionParticipant(tx).present(current.workspaceId, contactIds)).map(item => [item.id, item]));
    const companies = new Map((await companyTransactionParticipant(tx).present(current.workspaceId, companyIds)).map(item => [item.id, item]));
    const presented = evidence.flatMap(item => {
      const identity = item.contactId ? contacts.get(String(item.contactId)) : companies.get(String(item.companyId));
      if (!identity || identity.version !== item.targetVersion) return [];
      return [{ candidateId: String(item.candidateId), targetType: item.contactId ? "contact" as const : "company" as const,
        targetId: String(item.contactId ?? item.companyId), targetVersion: Number(item.targetVersion),
        expectedTargetVersion: Number(item.targetVersion), displayName: String(identity.displayName),
        maskedEmail: item.contactId ? maskEmail(identity.email as string | null) : null,
        maskedPhone: item.contactId ? maskPhone(identity.phone as string | null) : null,
        ...(item.companyId ? { companyName: String(identity.displayName) } : {}),
        evidenceKind: item.evidenceKind as "email" | "phone" | "name_company",
        evidenceStrength: item.evidenceStrength as "strong" | "supplementary" | "probable",
        canLink: current.role !== "member" }];
    });
    const currentSnapshot = presented.length === evidence.length, candidates = currentSnapshot ? presented : [];
    const capabilities = identityReviewCapabilities(current, { hasCompany: Boolean(lead.company),
      contactCandidates: candidates.some(item => item.targetType === "contact"),
      companyCandidates: candidates.some(item => item.targetType === "company"), current: currentSnapshot });
    return assertIdentityReviewPresentationSafe({ contractVersion: "lead-identity-review-detail.v1", requestId,
      reviewId: String(review.id), leadId: String(review.lead_id),
      reviewVersion: Number(review.version), leadVersion: Number(lead.version), intakeVersion: Number(lead.intake_version),
      lead: { displayName: String(lead.display_name), maskedEmail: maskEmail(lead.email_display), maskedPhone: maskPhone(lead.phone),
        companyName: lead.company ? String(lead.company) : null, lifecycle: String(lead.lifecycle_code ?? "new"),
        receivedAt: new Date(String(lead.received_at)).toISOString() },
      originalAttribution: { sourceCategory: String(lead.original_source_category),
        sourcePlatform: lead.original_source_platform ? String(lead.original_source_platform) : null,
        sourceMedium: String(lead.original_source_medium), sourceDetail: (lead.original_source_detail ?? {}) as Record<string, string>,
        campaignContext: (lead.original_campaign_context ?? {}) as Record<string, string>,
        attributionContractVersion: String(lead.attribution_contract_version), intakeChannel: "manual" },
      assignment: { responsibleMembershipId: lead.owner_membership_id, responsibleTeamId: lead.responsible_team_id,
        visibility: String(lead.visibility) },
      candidateSummary: { strong: candidates.filter(item => item.evidenceStrength === "strong").length,
        supplementary: candidates.filter(item => item.evidenceStrength === "supplementary").length,
        probable: candidates.filter(item => item.evidenceStrength === "probable").length },
      capabilities, reconciliation: currentSnapshot ? { status: "current", retryable: false, action: "none" }
        : { status: "stale", retryable: true, action: "refresh_identity_review" }, candidates,
      nextView: { kind: "identity_review_detail", leadId: String(review.lead_id), reviewId: String(review.id) } });
  });
}

export const getIdentityReviewDetailV1 = getIdentityReviewCandidatesV1;
