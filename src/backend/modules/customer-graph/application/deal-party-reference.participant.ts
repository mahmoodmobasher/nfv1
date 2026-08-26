import type { ModuleTransaction } from "@/backend/platform/database";
import type { TrustedActor } from "@/backend/platform/authorization";

export type DealPartyRef = {
  recordType: "crm.company" | "crm.contact";
  recordId: string;
};
export function dealPartyReferenceParticipant(tx: ModuleTransaction) {
  async function resolve(
    actor: TrustedActor,
    refs: DealPartyRef[],
    lock = false,
  ) {
    const companies = [
        ...new Set(
          refs
            .filter((r) => r.recordType === "crm.company")
            .map((r) => r.recordId),
        ),
      ].sort(),
      contacts = [
        ...new Set(
          refs
            .filter((r) => r.recordType === "crm.contact")
            .map((r) => r.recordId),
        ),
      ].sort();
    const companyRows = companies.length
      ? (
          await tx.query<{
            id: string;
            label: string;
            visibility: string;
            responsibleMembershipId: string | null;
            available: boolean;
          }>(
            `select c.id,c.display_name label,c.visibility,c.responsible_membership_id "responsibleMembershipId",(c.status='active' and c.authority_contract_version='customer-graph-v1' and ($3::text<>'member' or c.visibility='workspace' or c.responsible_membership_id=$4::uuid or exists(select 1 from company_visible_teams cvt join team_memberships tm on tm.workspace_id=cvt.workspace_id and tm.team_id=cvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where cvt.workspace_id=c.workspace_id and cvt.company_id=c.id and tm.workspace_membership_id=$4::uuid))) available from companies c where c.workspace_id=$1 and c.id=any($2::uuid[]) order by c.id ${lock ? "for no key update of c" : ""}`,
            [actor.workspaceId, companies, actor.role, actor.membershipId],
          )
        ).rows
      : [];
    const contactRows = contacts.length
      ? (
          await tx.query<{
            id: string;
            label: string;
            visibility: string;
            responsibleMembershipId: string | null;
            available: boolean;
          }>(
            `select c.id,c.display_name label,c.visibility,c.responsible_membership_id "responsibleMembershipId",(c.status='active' and c.authority_contract_version='customer-graph-v1' and ($3::text<>'member' or c.visibility='workspace' or c.responsible_membership_id=$4::uuid or exists(select 1 from contact_visible_teams cvt join team_memberships tm on tm.workspace_id=cvt.workspace_id and tm.team_id=cvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where cvt.workspace_id=c.workspace_id and cvt.contact_id=c.id and tm.workspace_membership_id=$4::uuid))) available from contacts c where c.workspace_id=$1 and c.id=any($2::uuid[]) order by c.id ${lock ? "for no key update of c" : ""}`,
            [actor.workspaceId, contacts, actor.role, actor.membershipId],
          )
        ).rows
      : [];
    const values = new Map<string, { label: string; available: boolean }>();
    for (const r of companyRows)
      values.set(`crm.company:${r.id}`, {
        label: r.label,
        available: r.available,
      });
    for (const r of contactRows)
      values.set(`crm.contact:${r.id}`, {
        label: r.label,
        available: r.available,
      });
    return values;
  }
  return {
    async lockAndRequire(actor: TrustedActor, refs: DealPartyRef[]) {
      const values = await resolve(actor, refs, true);
      if (
        refs.some(
          (ref) => !values.get(`${ref.recordType}:${ref.recordId}`)?.available,
        )
      )
        throw Object.assign(new Error("party_unavailable"), {
          code: "party_unavailable",
          status: 409,
        });
      return values;
    },
    async lockAndRequireDealParties(
      actor: TrustedActor,
      companyId: string,
      contactIds: string[],
    ) {
      const refs: DealPartyRef[] = [
          { recordType: "crm.company", recordId: companyId },
          ...contactIds.map((recordId) => ({
            recordType: "crm.contact" as const,
            recordId,
          })),
        ],
        values = await resolve(actor, refs, true);
      if (
        refs.some(
          (ref) => !values.get(`${ref.recordType}:${ref.recordId}`)?.available,
        )
      )
        throw Object.assign(new Error("party_unavailable"), {
          code: "party_unavailable",
          status: 409,
        });
      if (contactIds.length) {
        const count = Number(
          (
            await tx.query<{ count: number }>(
              `select count(distinct contact_id)::int count from contact_company_affiliations where workspace_id=$1 and company_id=$2 and contact_id=any($3::uuid[]) and lifecycle='active'`,
              [actor.workspaceId, companyId, [...new Set(contactIds)].sort()],
            )
          ).rows[0]?.count ?? 0,
        );
        if (count !== new Set(contactIds).size)
          throw Object.assign(new Error("party_unavailable"), {
            code: "party_unavailable",
            status: 409,
          });
      }
      return values;
    },
    async present(actor: TrustedActor, refs: DealPartyRef[]) {
      return resolve(actor, refs, false);
    },
  };
}
