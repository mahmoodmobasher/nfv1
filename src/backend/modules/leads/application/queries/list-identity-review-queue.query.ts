import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { runModuleTransaction } from "@/backend/platform/database";
import { lookupActiveActor, revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { assertIdentityReviewPresentationSafe, identityReviewTransactionParticipant, type IdentityReviewQueueFilterV1,
  type IdentityReviewQueueViewV1 } from "@/backend/modules/identity-review";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { identityReviewCapabilities } from "./get-identity-review-candidates.query";

// Read trace: protected pending queue; current actor plus per-row assignment/visibility; allowlisted filters;
// review updated_at/id keyset cursor; safe <=50 rows; private/no-store route; Workspace/state indexes; p95 target <200 ms.

const DEFAULT_LIMIT = 25, MAX_LIMIT = 50, MAX_SCAN_PAGES = 10;
const uuid = z.string().uuid();

type CursorV1 = { v: 1; updatedAt: string; reviewId: string; assignment: string; evidence: string };

function decodeCursor(value: string | undefined, filters: Pick<IdentityReviewQueueFilterV1, "assignment" | "evidence">): CursorV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorV1;
    if (parsed.v !== 1 || !Number.isFinite(Date.parse(parsed.updatedAt)) || !uuid.safeParse(parsed.reviewId).success ||
        parsed.assignment !== filters.assignment || parsed.evidence !== filters.evidence) throw new Error("invalid");
    return parsed;
  } catch { throw new LeadIntakeError("validation_failed", 400); }
}

function encodeCursor(row: { updatedAt: string; reviewId: string }, filters: Pick<IdentityReviewQueueFilterV1, "assignment" | "evidence">) {
  return Buffer.from(JSON.stringify({ v: 1, updatedAt: row.updatedAt, reviewId: row.reviewId,
    assignment: filters.assignment, evidence: filters.evidence })).toString("base64url");
}

export function parseIdentityReviewQueueFilters(url: URL): IdentityReviewQueueFilterV1 {
  const allowed = new Set(["limit", "cursor", "assignment", "evidence"]);
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !allowed.has(key)) || [...allowed].some(key => url.searchParams.getAll(key).length > 1))
    throw new LeadIntakeError("validation_failed", 400);
  const assignment = url.searchParams.get("assignment") ?? "all", evidence = url.searchParams.get("evidence") ?? "any";
  const rawLimit = url.searchParams.get("limit"), limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!["all", "mine", "unassigned"].includes(assignment) || !["any", "email", "phone", "name_company"].includes(evidence) ||
      !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new LeadIntakeError("validation_failed", 400);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  decodeCursor(cursor, { assignment: assignment as IdentityReviewQueueFilterV1["assignment"], evidence: evidence as IdentityReviewQueueFilterV1["evidence"] });
  return { assignment: assignment as IdentityReviewQueueFilterV1["assignment"],
    evidence: evidence as IdentityReviewQueueFilterV1["evidence"], limit, ...(cursor ? { cursor } : {}) };
}

export async function listIdentityReviewQueueV1(pool: Pool, actorInput: TrustedActor, filters: IdentityReviewQueueFilterV1,
  requestId: string = randomUUID()): Promise<IdentityReviewQueueViewV1> {
  return runModuleTransaction(pool, async tx => {
    const previewActor = await lookupActiveActor(tx, actorInput), authority = workspaceAuthorityParticipant(tx);
    let actor = previewActor;
    let cursor = decodeCursor(filters.cursor, { assignment: filters.assignment, evidence: filters.evidence });
    const items: IdentityReviewQueueViewV1["items"] = [];
    let lastScanned: { updatedAt: string; reviewId: string } | null = null, exhausted = false;
    for (let page = 0; page < MAX_SCAN_PAGES && items.length < filters.limit + 1; page++) {
      const refs = await identityReviewTransactionParticipant(tx).listPendingPage({ workspaceId: actor.workspaceId,
        beforeUpdatedAt: cursor?.updatedAt ?? null, beforeId: cursor?.reviewId ?? null,
        limit: Math.min(MAX_LIMIT, filters.limit + 1), evidence: filters.evidence });
      if (!refs.length) { exhausted = true; break; }
      lastScanned = { updatedAt: new Date(refs.at(-1)!.updatedAt).toISOString(), reviewId: refs.at(-1)!.reviewId };
      const leadParticipant = leadTransactionParticipant(tx), reviewParticipant = identityReviewTransactionParticipant(tx);
      const previewContexts = new Map((await leadParticipant.readReviewPresentationContexts(actor.workspaceId,
        refs.map(ref => ({ leadId: ref.leadId, intakeId: ref.intakeId })))).map(item => [item.id, item]));
      const eligible: typeof refs = [];
      for (const ref of refs) {
        const lead = previewContexts.get(ref.leadId);
        if (!lead || !(await authority.canDiscloseLead(previewActor, lead))) continue;
        if (filters.assignment === "mine" && lead.owner_membership_id !== previewActor.membershipId) continue;
        if (filters.assignment === "unassigned" && lead.owner_membership_id !== null) continue;
        eligible.push(ref);
      }
      if (!eligible.length) {
        if (refs.length < Math.min(MAX_LIMIT, filters.limit + 1)) { exhausted = true; break; }
        cursor = { v: 1, updatedAt: lastScanned.updatedAt, reviewId: lastScanned.reviewId,
          assignment: filters.assignment, evidence: filters.evidence };
        continue;
      }
      const contexts = new Map((await leadParticipant.lockReviewPresentationContexts(actor.workspaceId,
        eligible.map(ref => ({ leadId: ref.leadId, intakeId: ref.intakeId })))).map(item => [item.id, item]));
      const lockedReviews = new Map((await reviewParticipant.lockQueueDisclosureReviews(actor.workspaceId,
        eligible.map(ref => ref.reviewId))).map(item => [item.id, item]));
      const snapshots = await reviewParticipant.queueTargetSnapshots(actor.workspaceId, eligible.map(ref => ref.reviewId));
      const contactIds = snapshots.flatMap(item => item.contactId ? [item.contactId] : []);
      const companyIds = snapshots.flatMap(item => item.companyId ? [item.companyId] : []);
      const contactParticipant = contactTransactionParticipant(tx), companyParticipant = companyTransactionParticipant(tx);
      try { await companyParticipant.lockCandidateSet(actor.workspaceId, snapshots.flatMap(item => item.companyId
        ? [{ id: item.companyId, version: item.targetVersion }] : [])); } catch { /* stale rows are reconciled below */ }
      try { await contactParticipant.lockCandidateSet(actor.workspaceId, snapshots.flatMap(item => item.contactId
        ? [{ id: item.contactId, version: item.targetVersion }] : [])); } catch { /* stale rows are reconciled below */ }
      const orderedLeads = [...eligible].sort((left, right) => left.leadId.localeCompare(right.leadId))
        .map(ref => contexts.get(ref.leadId)!);
      await authority.lockReferences({ workspaceId: actor.workspaceId, leadIds: orderedLeads.map(lead => lead.id),
        membershipIds: [previewActor.membershipId, ...orderedLeads.map(lead => lead.owner_membership_id)],
        teamIds: orderedLeads.map(lead => lead.responsible_team_id) });
      actor = await revalidateActiveActor(tx, actorInput);
      const contacts = new Map((await contactParticipant.present(actor.workspaceId, contactIds)).map(item => [item.id, item.version]));
      const companies = new Map((await companyParticipant.present(actor.workspaceId, companyIds)).map(item => [item.id, item.version]));
      for (const ref of eligible) {
        const lead = contexts.get(ref.leadId), updatedAt = new Date(ref.updatedAt).toISOString();
        const lockedReview = lockedReviews.get(ref.reviewId);
        if (!lead || !lockedReview || lockedReview.state !== "pending" || lockedReview.version !== ref.reviewVersion ||
            Number(lead.version) !== Number(previewContexts.get(ref.leadId)?.version) ||
            Number(lead.intake_version) !== Number(previewContexts.get(ref.leadId)?.intake_version) ||
            !(await authority.canDiscloseLead(actor, lead)) ||
            (filters.assignment === "mine" && lead.owner_membership_id !== actor.membershipId) ||
            (filters.assignment === "unassigned" && lead.owner_membership_id !== null))
          throw new LeadIntakeError("resource_not_found", 404);
        if (filters.assignment === "all" || filters.assignment === "mine" || filters.assignment === "unassigned") {
          const targets = snapshots.filter(item => item.reviewId === ref.reviewId);
          const currentTargets = targets.every(item => item.contactId
            ? contacts.get(item.contactId) === item.targetVersion : companies.get(item.companyId!) === item.targetVersion);
          const counts = currentTargets ? { strong: Number(ref.strongCount), supplementary: Number(ref.supplementaryCount),
            probable: Number(ref.probableCount) } : { strong: 0, supplementary: 0, probable: 0 };
          items.push({ reviewId: ref.reviewId, leadId: ref.leadId,
            lead: { displayName: String(lead.display_name), companyName: lead.company ? String(lead.company) : null,
              receivedAt: new Date(String(lead.received_at)).toISOString() },
            originalAttribution: { sourceCategory: String(lead.original_source_category),
              sourcePlatform: lead.original_source_platform ? String(lead.original_source_platform) : null,
              sourceMedium: String(lead.original_source_medium), intakeChannel: "manual" },
            assignment: { responsibleMembershipId: lead.owner_membership_id, responsibleTeamId: lead.responsible_team_id,
              visibility: String(lead.visibility) },
            versions: { lead: Number(lead.version), review: Number(ref.reviewVersion), intake: Number(lead.intake_version) },
            candidateSummary: counts,
            capabilities: identityReviewCapabilities(actor, { hasCompany: Boolean(lead.company),
              contactCandidates: currentTargets && targets.some(item => item.contactId),
              companyCandidates: currentTargets && targets.some(item => item.companyId), current: currentTargets }),
            reconciliation: currentTargets ? { status: "current", retryable: false, action: "none" }
              : { status: "stale", retryable: true, action: "refresh_identity_review" }, updatedAt,
            nextView: { kind: "identity_review_detail", leadId: ref.leadId, reviewId: ref.reviewId } });
          if (items.length >= filters.limit + 1) break;
        }
      }
      if (refs.length < Math.min(MAX_LIMIT, filters.limit + 1)) exhausted = true;
      break;
    }
    const overflow = items.length > filters.limit, hasMore = overflow || !exhausted;
    if (overflow) items.length = filters.limit;
    const boundary = overflow ? items.at(-1)! : lastScanned;
    await revalidateActiveActor(tx, actorInput);
    return assertIdentityReviewPresentationSafe({ contractVersion: "lead-identity-review-queue.v1", requestId, items,
      nextCursor: hasMore && boundary ? encodeCursor({ updatedAt: boundary.updatedAt, reviewId: boundary.reviewId }, filters) : null });
  });
}
