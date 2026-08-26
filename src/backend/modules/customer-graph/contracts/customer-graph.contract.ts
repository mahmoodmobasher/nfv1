import { z } from "zod";

export const CUSTOMER_GRAPH_QUERY = "customer-graph-query.v1" as const;
export const COMPANY_CREATE = "company-create.v1" as const;
export const COMPANY_EDIT = "company-edit.v1" as const;
export const COMPANY_LIFECYCLE = "company-lifecycle.v1" as const;
export const CONTACT_CREATE = "contact-create.v1" as const;
export const CONTACT_EDIT = "contact-edit.v1" as const;
export const CONTACT_LIFECYCLE = "contact-lifecycle.v1" as const;
export const CONTACT_AFFILIATION_REPLACE = "contact-affiliation-replace.v1" as const;

const uuid = z.string().uuid();
const expectedVersion = z.number().int().positive();
const clean = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const assignmentShape = {
  responsibleMembershipId: uuid.nullable().default(null),
  responsibleTeamId: uuid.nullable().default(null),
  visibility: z.enum(["workspace", "teams"]),
  visibleTeamIds: z.array(uuid).max(20),
};
function assignmentRules(value: { visibility:"workspace"|"teams"; visibleTeamIds:string[]; responsibleTeamId:string|null }, context:z.RefinementCtx) {
  if (new Set(value.visibleTeamIds).size !== value.visibleTeamIds.length)
    context.addIssue({ code: "custom", message: "duplicate_visible_team", path: ["visibleTeamIds"] });
  if (value.visibility === "workspace" && value.visibleTeamIds.length)
    context.addIssue({ code: "custom", message: "workspace_visibility_has_teams", path: ["visibleTeamIds"] });
  if (value.visibility === "teams" && !value.visibleTeamIds.length)
    context.addIssue({ code: "custom", message: "visible_team_required", path: ["visibleTeamIds"] });
  if (value.responsibleTeamId && value.visibility === "teams" && !value.visibleTeamIds.includes(value.responsibleTeamId))
    context.addIssue({ code: "custom", message: "responsible_team_must_be_visible", path: ["visibleTeamIds"] });
}

export const companyCreateCommandV1Schema = z.object({ contractVersion: z.literal(COMPANY_CREATE),
  displayName: clean(200), domain: clean(253).regex(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i).nullable(),
  ...assignmentShape }).strict().superRefine(assignmentRules);
export const companyEditCommandV1Schema = z.object({ contractVersion: z.literal(COMPANY_EDIT), expectedVersion,
  displayName: clean(200), domain: clean(253).regex(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i).nullable(),
  ...assignmentShape }).strict().superRefine(assignmentRules);
export const companyLifecycleCommandV1Schema = z.object({ contractVersion: z.literal(COMPANY_LIFECYCLE), expectedVersion }).strict();

const contactFields = { firstName: clean(100), lastName: clean(100).nullable(), email: z.string().trim().email().max(320).nullable(),
  phone: clean(50).regex(/^\+[1-9]\d{6,14}$/).nullable() };
export const contactCreateCommandV1Schema = z.object({ contractVersion: z.literal(CONTACT_CREATE), ...contactFields,
  affiliation: z.object({ companyId: uuid, roleCode: z.enum(["employee","owner","executive","decision_maker","billing","technical","advisor","contractor","other"]) }).strict().nullable(),
  ...assignmentShape }).strict().superRefine(assignmentRules);
export const contactEditCommandV1Schema = z.object({ contractVersion: z.literal(CONTACT_EDIT), expectedVersion,
  ...contactFields, ...assignmentShape }).strict().superRefine(assignmentRules);
export const contactLifecycleCommandV1Schema = z.object({ contractVersion: z.literal(CONTACT_LIFECYCLE), expectedVersion }).strict();
export const contactAffiliationReplaceCommandV1Schema = z.object({ contractVersion: z.literal(CONTACT_AFFILIATION_REPLACE), expectedVersion,
  affiliation: z.object({ companyId: uuid, roleCode: z.enum(["employee","owner","executive","decision_maker","billing","technical","advisor","contractor","other"]) }).strict().nullable() }).strict();

export const customerGraphListQueryV1Schema = z.object({ status: z.enum(["active","archived"]).default("active"),
  cursor: z.string().max(1024).optional(), limit: z.number().int().min(1).max(50).default(25),bootstrap:z.boolean().default(false) }).strict().superRefine((value,context)=>{if(value.bootstrap&&value.cursor)context.addIssue({code:"custom",message:"bootstrap_cursor_forbidden",path:["cursor"]});});

const reconciliation=z.discriminatedUnion("required",[z.object({required:z.literal(false),action:z.literal("none")}).strict(),z.object({required:z.literal(true),action:z.literal("authority_adoption_required")}).strict()]);
const capabilities=z.object({canEdit:z.boolean(),canArchive:z.boolean(),canRestore:z.boolean()}).strict();
const root=z.object({id:uuid,displayName:clean(200),status:z.enum(["active","archived"]),version:expectedVersion,updatedAt:z.string().datetime({offset:true}),responsibleMembershipId:uuid.nullable(),responsibleTeamId:uuid.nullable(),visibility:z.enum(["workspace","teams"]),authorityContractVersion:z.enum(["legacy-p1a-root-v1","customer-graph-v1"]),visibleTeamIds:z.array(uuid).max(20),reconciliation}).strict();
export const customerGraphListViewV1Schema=z.object({contractVersion:z.literal("customer-graph-list.v1"),kind:z.enum(["company","contact"]),capabilities:z.object({canCreate:z.boolean()}).strict(),items:z.array(z.object({id:uuid,displayName:clean(200),status:z.enum(["active","archived"]),version:expectedVersion,updatedAt:z.string().datetime({offset:true}),capabilities,reconciliation}).strict()).max(50),nextCursor:z.string().max(1024).nullable(),requestId:uuid}).strict();
const option=z.object({id:uuid,label:clean(200)}).strict(),options=z.object({responsibleMemberships:z.array(option).max(500),teams:z.array(option).max(100)}).strict();
const affiliation=z.union([z.object({affiliationId:uuid,companyId:uuid,companyName:clean(200),roleCode:z.enum(["employee","owner","executive","decision_maker","billing","technical","advisor","contractor","other"]),isPrimary:z.boolean(),version:expectedVersion,companyVisible:z.literal(true)}).strict(),z.object({companyUnavailable:z.literal(true)}).strict()]);
const detailCapabilities=capabilities.extend({canManageAffiliations:z.boolean(),canManageAssignment:z.boolean()}).strict();
const companyRecord=root.extend({domain:z.string().max(253).nullable(),disclosure:z.object({domain:z.enum(["full","withheld"])}).strict(),affiliations:z.array(affiliation).max(0),capabilities:detailCapabilities}).strict();
const contactRecord=root.extend({firstName:clean(100).nullable(),lastName:clean(100).nullable(),email:z.string().email().max(320).nullable(),phone:z.string().max(50).nullable(),maskedEmail:z.string().max(320).nullable(),maskedPhone:z.string().max(50).nullable(),disclosure:z.object({channels:z.enum(["full","masked"])}).strict(),affiliations:z.array(affiliation).max(20),capabilities:detailCapabilities}).strict();
export const customerGraphDetailViewV1Schema=z.object({contractVersion:z.literal("customer-graph-detail.v1"),kind:z.enum(["company","contact"]),record:z.union([companyRecord,contactRecord]),options,requestId:uuid}).strict().superRefine((value,context)=>{if(!value.record.capabilities.canManageAssignment&&(value.options.responsibleMemberships.length||value.options.teams.length))context.addIssue({code:"custom",message:"assignment_options_disclosure",path:["options"]});if(value.kind==="company"&&"firstName" in value.record||value.kind==="contact"&&"domain" in value.record)context.addIssue({code:"custom",message:"kind_record_mismatch",path:["record"]});});
export const companyResultV1Schema=z.object({contractVersion:z.literal("company-result.v1"),companyId:uuid,version:expectedVersion,replayed:z.boolean(),requestId:uuid}).strict();
export const contactResultV1Schema=z.object({contractVersion:z.literal("contact-result.v1"),contactId:uuid,version:expectedVersion,replayed:z.boolean(),requestId:uuid}).strict();
export const customerGraphErrorEnvelopeV1Schema=z.object({error:z.object({code:z.enum(["authentication_required","permission_required","resource_not_found","validation_failed","unsupported_contract_version","idempotency_conflict","stale_version","assignment_unavailable","authority_conflict","customer_graph_unavailable","unexpected_error"]),message:clean(200),retryable:z.boolean(),reconciliation:z.object({required:z.boolean(),action:z.enum(["none","refetch_record","refetch_options","retry_same_request"])}).strict()}).strict(),requestId:uuid}).strict();

export type CompanyCreateCommandV1 = z.infer<typeof companyCreateCommandV1Schema>;
export type CompanyEditCommandV1 = z.infer<typeof companyEditCommandV1Schema>;
export type ContactCreateCommandV1 = z.infer<typeof contactCreateCommandV1Schema>;
export type ContactEditCommandV1 = z.infer<typeof contactEditCommandV1Schema>;
export type ContactAffiliationReplaceCommandV1 = z.infer<typeof contactAffiliationReplaceCommandV1Schema>;
export type CustomerGraphListQueryV1 = z.infer<typeof customerGraphListQueryV1Schema>;
export type CustomerGraphListViewV1=z.infer<typeof customerGraphListViewV1Schema>;
export type CustomerGraphDetailViewV1=z.infer<typeof customerGraphDetailViewV1Schema>;

export type CustomerGraphErrorCode = "authentication_required"|"permission_required"|"resource_not_found"|"validation_failed"|
  "unsupported_contract_version"|"idempotency_conflict"|"stale_version"|"assignment_unavailable"|"authority_conflict"|
  "customer_graph_unavailable"|"unexpected_error";
export class CustomerGraphError extends Error {
  constructor(public code: CustomerGraphErrorCode, public status: number, public safe?: unknown) { super(code); }
}
