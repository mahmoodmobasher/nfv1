import type { ModuleTransaction } from "@/backend/platform/database";
import type { ContactCandidateV1, CreateContactIdentityV1 } from "../../contracts/contact-identity.contract";

export function contactTransactionParticipant(tx: ModuleTransaction) {
  return {
    async findCandidates(input: {
      workspaceId: string;
      emailNormalized: string | null;
      phoneNormalized: string | null;
      personNameNormalized: string;
      companyNameNormalized: string | null;
    }): Promise<ContactCandidateV1[]> {
      const candidates: ContactCandidateV1[] = [];
      if (input.emailNormalized) {
        const rows = await tx.query(
          `select id,version,display_name "displayName",email_display "emailDisplay",phone_display "phoneDisplay",company_id "companyId"
             from contacts where workspace_id=$1 and status='active' and email_normalized=$2 order by id limit 10`,
          [input.workspaceId, input.emailNormalized],
        );
        candidates.push(...rows.rows.map(row => ({ ...row, evidenceKind: "email", evidenceStrength: "strong" } as ContactCandidateV1)));
      }
      if (input.phoneNormalized) {
        const rows = await tx.query(
          `select id,version,display_name "displayName",email_display "emailDisplay",phone_display "phoneDisplay",company_id "companyId"
             from contacts where workspace_id=$1 and status='active' and phone_normalized=$2 order by id limit 10`,
          [input.workspaceId, input.phoneNormalized],
        );
        candidates.push(...rows.rows.map(row => ({ ...row, evidenceKind: "phone", evidenceStrength: "supplementary" } as ContactCandidateV1)));
      }
      if (input.companyNameNormalized) {
        const rows = await tx.query(
          `select c.id,c.version,c.display_name "displayName",c.email_display "emailDisplay",c.phone_display "phoneDisplay",c.company_id "companyId"
             from contacts c join companies o on o.workspace_id=c.workspace_id and o.id=c.company_id and o.status='active'
            where c.workspace_id=$1 and c.status='active' and c.person_name_normalized=$2 and o.name_normalized=$3
            order by c.id limit 10`,
          [input.workspaceId, input.personNameNormalized, input.companyNameNormalized],
        );
        candidates.push(...rows.rows.map(row => ({ ...row, evidenceKind: "name_company", evidenceStrength: "probable" } as ContactCandidateV1)));
      }
      return candidates;
    },
    async lockExisting(workspaceId: string, id: string, expectedVersion: number) {
      const row = (await tx.query(
        `select id,version,status from contacts where workspace_id=$1 and id=$2 order by id for update`,
        [workspaceId, id],
      )).rows[0];
      if (!row || row.status !== "active") throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      if (row.version !== expectedVersion) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      return row;
    },
    async create(input: CreateContactIdentityV1) {
      return (await tx.query(
        `insert into contacts(workspace_id,display_name,person_name_normalized,first_name,last_name,email_display,email_normalized,
          phone_display,phone_normalized,phone_country_code_used,normalization_version,company_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'p1a-identity-v1',$11) returning id,version`,
        [input.workspaceId, input.displayName, input.personNameNormalized, input.firstName, input.lastName,
          input.emailDisplay, input.emailNormalized, input.phoneDisplay, input.phoneNormalized, input.phoneCountryCodeUsed, input.companyId],
      )).rows[0] as { id: string; version: number };
    },
  };
}
