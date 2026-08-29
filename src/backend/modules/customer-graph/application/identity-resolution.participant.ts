import type { ModuleTransaction } from "@/backend/platform/database";

export type CreateCanonicalCompanyV1 = {
  workspaceId: string;
  displayName: string;
  nameNormalized: string;
  domainNormalized: string | null;
  governingOperationId: string;
  createdByMembershipId: string;
};
export type CreateCanonicalContactV1 = {
  workspaceId: string;
  displayName: string;
  personNameNormalized: string;
  firstName: string | null;
  lastName: string | null;
  emailDisplay: string | null;
  emailNormalized: string | null;
  phoneDisplay: string | null;
  phoneNormalized: string | null;
  phoneCountryCodeUsed: string | null;
  companyId: string | null;
  governingOperationId: string;
  createdByMembershipId: string;
};

export function customerGraphIdentityResolutionParticipant(tx: ModuleTransaction) {
  return {
    async createCanonicalCompany(input: CreateCanonicalCompanyV1) {
      const row = (
        await tx.query<{ id: string; version: number }>(
          `insert into companies(workspace_id,display_name,name_normalized,domain_normalized,normalization_version,status,
             governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
           values($1,$2,$3,$4,'customer-graph-v1','active',$5,$6,$6,'customer-graph-v1') returning id,version`,
          [input.workspaceId, input.displayName, input.nameNormalized, input.domainNormalized,
            input.governingOperationId, input.createdByMembershipId],
        )
      ).rows[0]!;
      if (input.domainNormalized)
        await tx.query(
          `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,normalization_version,
             is_primary,source,governing_operation_id,created_by_membership_id)
           values($1,$2,$3,$3,'customer-graph-v1',true,'manual',$4,$5)`,
          [input.workspaceId, row.id, input.domainNormalized, input.governingOperationId, input.createdByMembershipId],
        );
      return row;
    },
    async createCanonicalContact(input: CreateCanonicalContactV1) {
      const row = (
        await tx.query<{ id: string; version: number }>(
          `insert into contacts(workspace_id,display_name,person_name_normalized,first_name,last_name,email_display,email_normalized,
             phone_display,phone_normalized,phone_country_code_used,normalization_version,company_id,status,
             governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'customer-graph-v1',$11,'active',$12,$13,$13,'customer-graph-v1') returning id,version`,
          [input.workspaceId, input.displayName, input.personNameNormalized, input.firstName, input.lastName,
            input.emailDisplay, input.emailNormalized, input.phoneDisplay, input.phoneNormalized, input.phoneCountryCodeUsed,
            input.companyId, input.governingOperationId, input.createdByMembershipId],
        )
      ).rows[0]!;
      const points: Array<{ kind: "email" | "phone"; usage: string; display: string | null; value: string | null; country: string | null; primary: boolean }> = [
        { kind: "email", usage: "email_primary", display: input.emailDisplay, value: input.emailNormalized, country: null, primary: true },
        { kind: "phone", usage: "phone_direct", display: input.phoneDisplay, value: input.phoneNormalized, country: input.phoneCountryCodeUsed, primary: false },
      ];
      for (const point of points)
        if (point.value)
          await tx.query(
            `insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,
               phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id)
             values($1,$2,$3,$4,$5,$6,$7,'customer-graph-v1',$8,'manual',$9,$10)`,
            [input.workspaceId, row.id, point.kind, point.usage, point.display, point.value, point.country,
              point.primary, input.governingOperationId, input.createdByMembershipId],
          );
      if (input.companyId)
        await tx.query(
          `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,valid_from,
             governing_operation_id,created_by_membership_id)
           values($1,$2,$3,'other',true,now(),$4,$5)`,
          [input.workspaceId, row.id, input.companyId, input.governingOperationId, input.createdByMembershipId],
        );
      return row;
    },
  };
}
