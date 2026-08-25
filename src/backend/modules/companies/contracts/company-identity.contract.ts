export type CompanyCandidateV1 = {
  id: string;
  version: number;
  displayName: string;
  domainNormalized: string | null;
  evidenceKind: "name_company";
  evidenceStrength: "probable";
};

export type CreateCompanyIdentityV1 = {
  workspaceId: string;
  displayName: string;
  nameNormalized: string;
  domainNormalized: string | null;
};
