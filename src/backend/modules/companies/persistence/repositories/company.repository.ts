import type { ModuleTransaction } from "@/backend/platform/database";
import type { CompanyCandidateV1, CreateCompanyIdentityV1 } from "../../contracts/company-identity.contract";

export function companyTransactionParticipant(tx: ModuleTransaction) {
  return {
    async findCandidates(input: { workspaceId: string; nameNormalized: string | null; domainNormalized: string | null }): Promise<CompanyCandidateV1[]> {
      if (!input.nameNormalized && !input.domainNormalized) return [];
      const rows = await tx.query(
        `select id,version,display_name "displayName",domain_normalized "domainNormalized"
           from companies where workspace_id=$1 and status='active'
            and (($2::text is not null and name_normalized=$2) or ($3::text is not null and domain_normalized=$3))
          order by id limit 10`,
        [input.workspaceId, input.nameNormalized, input.domainNormalized],
      );
      return rows.rows.map(row => ({ ...row, evidenceKind: "name_company", evidenceStrength: "probable" } as CompanyCandidateV1));
    },
    async lockExisting(workspaceId: string, id: string, expectedVersion: number) {
      const row = (await tx.query(
        `select id,version,status from companies where workspace_id=$1 and id=$2 order by id for update`,
        [workspaceId, id],
      )).rows[0];
      if (!row || row.status !== "active") throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      if (row.version !== expectedVersion) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      return row;
    },
    async lockCandidateSet(workspaceId: string, candidates: CompanyCandidateV1[]) {
      const expected = new Map(candidates.map(candidate => [candidate.id, candidate.version]));
      const ids = [...expected.keys()].sort();
      if (!ids.length) return;
      const rows = (await tx.query(
        `select id,version,status from companies where workspace_id=$1 and id=any($2::uuid[]) order by id for update`,
        [workspaceId, ids])).rows;
      if (rows.length !== ids.length || rows.some(row => row.status !== "active" || expected.get(row.id) !== row.version))
        throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
    },
    async present(workspaceId: string, ids: string[]) {
      if (!ids.length) return [];
      return (await tx.query(
        `select id,version,display_name "displayName" from companies
          where workspace_id=$1 and id=any($2::uuid[]) and status='active'`, [workspaceId, ids])).rows;
    },
    async create(input: CreateCompanyIdentityV1) {
      return (await tx.query(
        `insert into companies(workspace_id,display_name,name_normalized,domain_normalized,normalization_version)
         values($1,$2,$3,$4,'p1a-identity-v1') returning id,version`,
        [input.workspaceId, input.displayName, input.nameNormalized, input.domainNormalized],
      )).rows[0] as { id: string; version: number };
    },
  };
}
