import type { ModuleTransaction } from "@/backend/platform/database";
import type { ContactCandidateV1 } from "@/backend/modules/contacts";

// Reviewed read model: Companies owns the Company-name predicate; Contacts retains all writes.
export function companyContactCandidateReadModel(tx: ModuleTransaction) {
  return {
    async findProbableContacts(input: { workspaceId: string; personNameNormalized: string; companyNameNormalized: string | null }) {
      if (!input.companyNameNormalized) return [] as ContactCandidateV1[];
      const rows = await tx.query(
        `select c.id,c.version,c.display_name "displayName",c.email_display "emailDisplay",c.phone_display "phoneDisplay",c.company_id "companyId"
           from companies o join contacts c on c.workspace_id=o.workspace_id and c.company_id=o.id and c.status='active'
          where o.workspace_id=$1 and o.status='active' and o.name_normalized=$2 and c.person_name_normalized=$3
          order by c.id limit 10`, [input.workspaceId, input.companyNameNormalized, input.personNameNormalized]);
      return rows.rows.map(row => ({ ...row, evidenceKind: "name_company", evidenceStrength: "probable" } as ContactCandidateV1));
    },
  };
}
