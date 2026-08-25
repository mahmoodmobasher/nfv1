export type ContactCandidateV1 = {
  id: string;
  version: number;
  displayName: string;
  emailDisplay: string | null;
  phoneDisplay: string | null;
  companyId: string | null;
  evidenceKind: "email" | "phone" | "name_company";
  evidenceStrength: "strong" | "supplementary" | "probable";
};

export type CreateContactIdentityV1 = {
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
  normalizationVersion: string;
  companyId: string | null;
};
