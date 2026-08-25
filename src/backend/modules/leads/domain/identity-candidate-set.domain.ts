import type { ContactCandidateV1 } from "@/backend/modules/contacts";
import type { CompanyCandidateV1 } from "@/backend/modules/companies";

export const CANDIDATE_QUERY_CONTRACT = "p1a-candidate-query.v1" as const;
export type CandidateQueryV1 = {
  contractVersion: typeof CANDIDATE_QUERY_CONTRACT;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  personNameNormalized: string;
  companyNameNormalized: string | null;
  companyDomainNormalized: string | null;
};

export function selectCandidateSetV1(directContacts: ContactCandidateV1[], probableContacts: ContactCandidateV1[],
  allCompanies: CompanyCandidateV1[]) {
  const strong = directContacts.filter(candidate => candidate.evidenceKind === "email").slice(0, 10);
  const supplementary = directContacts.filter(candidate => candidate.evidenceKind === "phone").slice(0, 10);
  const probableContactSet = probableContacts.filter(candidate => candidate.evidenceKind === "name_company").slice(0, 10);
  const companies = allCompanies.slice(0, Math.max(0, 10 - probableContactSet.length));
  const contacts = [...strong, ...supplementary, ...probableContactSet];
  return { contacts, companies, summary: { strong: strong.length, supplementary: supplementary.length,
    probable: probableContactSet.length + companies.length } };
}

export function sameCandidateSet(left: Array<{ id: string; version: number; evidenceKind: string }>,
  right: Array<{ id: string; version: number; evidenceKind: string }>) {
  const keys = (items: typeof left) => items.map(item => `${item.evidenceKind}:${item.id}:${item.version}`).sort();
  const a = keys(left), b = keys(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function sameVersionSet(left: Array<{ id: string; version: number }>, right: Array<{ id: string; version: number }>) {
  const keys = (items: typeof left) => items.map(item => `${item.id}:${item.version}`).sort();
  const a = keys(left), b = keys(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
