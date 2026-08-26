import { z } from "zod";

export const COMPANY_SCREEN_CREATE_V2 = "company-screen-create.v2" as const;
export const COMPANY_SCREEN_EDIT_V2 = "company-screen-edit.v2" as const;
export const CONTACT_SCREEN_CREATE_V2 = "contact-screen-create.v2" as const;
export const CONTACT_SCREEN_EDIT_V2 = "contact-screen-edit.v2" as const;
export const LEAD_SCREEN_CREATE_V2 = "lead-screen-create.v2" as const;
export const LEAD_SCREEN_EDIT_V2 = "lead-screen-edit.v2" as const;

const uuid = z.string().uuid();
const version = z.number().int().positive();
const clean = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const nullable = (max: number) => clean(max).nullable();
const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => new URL(value).protocol === "https:")
  .nullable();
const email = z.string().trim().email().max(320);
const phone = clean(50).nullable();
const address = z
  .object({
    street: nullable(255),
    city: nullable(100),
    stateProvince: nullable(100),
    postalCode: nullable(30),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
  })
  .strict();
const money = z
  .object({
    amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
    currencyCode: z.enum(["USD", "CAD"]),
    currencyExponent: z.literal(2),
  })
  .strict()
  .nullable();
const assignment = z
  .object({
    responsibleMembershipId: uuid.nullable(),
    responsibleMembershipVersion: version.nullable(),
    responsibleTeamId: uuid.nullable(),
    responsibleTeamVersion: version.nullable(),
    visibility: z.enum(["workspace", "teams"]),
    visibleTeamIds: z.array(uuid).max(20),
    visibleTeamVersions: z.record(uuid, version),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.visibleTeamIds).size !== value.visibleTeamIds.length)
      context.addIssue({
        code: "custom",
        message: "duplicate_visible_team",
        path: ["visibleTeamIds"],
      });
    if ((value.responsibleMembershipId === null) !== (value.responsibleMembershipVersion === null))
      context.addIssue({ code: "custom", message: "membership_version_pair_required", path: ["responsibleMembershipVersion"] });
    if ((value.responsibleTeamId === null) !== (value.responsibleTeamVersion === null))
      context.addIssue({ code: "custom", message: "team_version_pair_required", path: ["responsibleTeamVersion"] });
    if (Object.keys(value.visibleTeamVersions).sort().join() !== [...value.visibleTeamIds].sort().join())
      context.addIssue({ code: "custom", message: "visible_team_versions_mismatch", path: ["visibleTeamVersions"] });
    if (
      (value.visibility === "workspace" && value.visibleTeamIds.length) ||
      (value.visibility === "teams" && !value.visibleTeamIds.length)
    )
      context.addIssue({
        code: "custom",
        message: "invalid_visible_team_set",
        path: ["visibleTeamIds"],
      });
    if (
      value.visibility === "teams" &&
      value.responsibleTeamId &&
      !value.visibleTeamIds.includes(value.responsibleTeamId)
    )
      context.addIssue({
        code: "custom",
        message: "responsible_team_must_be_visible",
        path: ["visibleTeamIds"],
      });
  });
export const companyScreenProfileV2Schema = z
  .object({
    name: clean(200),
    domain: nullable(253),
    website: httpsUrl,
    industry: nullable(120),
    sizeBand: z
      .enum(["micro", "small", "medium", "large", "enterprise"])
      .nullable(),
    employeeCount: z.number().int().min(0).max(2147483647).nullable(),
    annualRevenue: money,
    parentCompanyId: uuid.nullable(),
    parentCompanyVersion: version.nullable(),
    phone,
    address,
  })
  .strict().superRefine((value, context) => { if ((value.parentCompanyId === null) !== (value.parentCompanyVersion === null)) context.addIssue({code:"custom",message:"parent_company_version_pair_required",path:["parentCompanyVersion"]}); });
const affiliation = z
  .object({
    companyId: uuid,
    companyVersion: version,
    roleCode: z.enum([
      "employee",
      "owner",
      "executive",
      "decision_maker",
      "billing",
      "technical",
      "advisor",
      "contractor",
      "other",
    ]),
    isPrimary: z.literal(true),
  })
  .strict()
  .nullable();
export const contactScreenProfileV2Schema = z
  .object({
    salutation: nullable(20),
    firstName: clean(100),
    lastName: clean(100),
    jobTitle: nullable(160),
    department: nullable(120),
    primaryEmail: email,
    secondaryEmail: email.nullable(),
    directPhone: phone,
    mobilePhone: phone,
    linkedinUrl: httpsUrl,
    lifecycleStage: z.enum([
      "lead",
      "marketing_qualified",
      "sales_qualified",
      "opportunity",
      "customer",
      "evangelist",
      "other",
    ]),
    company: affiliation,
    address,
  })
  .strict();
export const leadScreenProfileV2Schema = z
  .object({
    salutation: nullable(20),
    firstName: clean(100),
    lastName: clean(100),
    company: z.object({ snapshotName: clean(160), companyId: uuid, companyVersion: version }).strict(),
    jobTitle: nullable(160),
    primaryEmail: email,
    secondaryEmail: email.nullable(),
    officePhone: phone,
    mobilePhone: phone,
    fax: phone,
    website: httpsUrl,
    twitterHandle: z
      .string()
      .regex(/^@[A-Za-z0-9_]{1,15}$/)
      .nullable(),
    promotionalEmailOptOut: z.boolean().nullable(),
    source: z.enum([
      "website",
      "referral",
      "outbound",
      "event",
      "partner",
      "social_media",
      "import",
      "manual",
      "other",
    ]),
    stageId: uuid,
    stageUpdatedAt: z.string().datetime({offset:true}),
    rating: z.enum(["hot", "warm", "cold"]).nullable(),
    industry: nullable(120),
    annualRevenue: money,
    employeeCount: z.number().int().min(0).max(2147483647).nullable(),
    address,
  })
  .strict();

export const companyScreenCreateCommandV2Schema = z
  .object({
    contractVersion: z.literal(COMPANY_SCREEN_CREATE_V2),
    profile: companyScreenProfileV2Schema,
    assignment,
  })
  .strict();
export const companyScreenEditCommandV2Schema = z
  .object({
    contractVersion: z.literal(COMPANY_SCREEN_EDIT_V2),
    expectedVersion: version,
    profile: companyScreenProfileV2Schema,
    assignment,
  })
  .strict();
export const contactScreenCreateCommandV2Schema = z
  .object({
    contractVersion: z.literal(CONTACT_SCREEN_CREATE_V2),
    profile: contactScreenProfileV2Schema,
    assignment,
  })
  .strict();
export const contactScreenEditCommandV2Schema = z
  .object({
    contractVersion: z.literal(CONTACT_SCREEN_EDIT_V2),
    expectedVersion: version,
    profile: contactScreenProfileV2Schema,
    assignment,
  })
  .strict();
export const leadScreenCreateCommandV2Schema = z
  .object({
    contractVersion: z.literal(LEAD_SCREEN_CREATE_V2),
    contactDisposition:z.literal("dismiss"),
    profile: leadScreenProfileV2Schema,
    assignment,
  })
  .strict();
export const leadScreenEditCommandV2Schema = z
  .object({
    contractVersion: z.literal(LEAD_SCREEN_EDIT_V2),
    expectedVersion: version,
    profile: leadScreenProfileV2Schema,
    assignment,
  })
  .strict();

export const screenFormBootstrapV1Schema = z
  .object({
    contractVersion: z.literal("screen-form-bootstrap.v1"),
    kind: z.enum(["company", "contact", "lead"]),
    capabilities: z
      .object({
        canCreate: z.boolean(),
        canManageAssignment: z.boolean(),
        canWriteSensitiveProfile: z.boolean(),
      })
      .strict(),
    requestId: uuid,
  })
  .strict();
export const screenFormOptionKindV1Schema=z.enum(["company","parent_company","assignment_membership","assignment_team","lead_stage"]);
export const screenFormOptionsQueryV1Schema=z.object({kind:z.enum(["company","contact","lead"]),optionKind:screenFormOptionKindV1Schema,query:z.string().trim().max(100).default(""),cursor:z.string().max(1024).optional(),limit:z.number().int().min(1).max(50).default(25),excludeRecordId:uuid.optional()}).strict().superRefine((value,context)=>{const allowed={company:["parent_company","assignment_membership","assignment_team"],contact:["company","assignment_membership","assignment_team"],lead:["company","assignment_membership","assignment_team","lead_stage"]} as const;if(!(allowed[value.kind] as readonly string[]).includes(value.optionKind))context.addIssue({code:"custom",message:"option_kind_not_available",path:["optionKind"]});if(value.excludeRecordId&&!(value.kind==="company"&&value.optionKind==="parent_company"))context.addIssue({code:"custom",message:"exclude_record_not_available",path:["excludeRecordId"]});});
const optionTarget=z.discriminatedUnion("kind",[z.object({kind:z.literal("version"),version}).strict(),z.object({kind:z.literal("updated_at"),updatedAt:z.string().datetime({offset:true})}).strict()]);
export const screenFormOptionsV1Schema=z.object({contractVersion:z.literal("screen-form-options.v1"),kind:z.enum(["company","contact","lead"]),optionKind:screenFormOptionKindV1Schema,items:z.array(z.object({id:uuid,label:clean(200),target:optionTarget}).strict()).max(50),nextCursor:z.string().max(1024).nullable(),requestId:uuid}).strict();
const detailBase = {
  contractVersion: z.literal("screen-profile-detail.v1"),
  recordId: uuid,
  version,
  capabilities: z
    .object({
      canEdit: z.boolean(),
      canManageAssignment: z.boolean(),
      canWriteSensitiveProfile: z.boolean(),
    })
    .strict(),
  requestId: uuid,
};
const withheld=z.object({disclosure:z.literal("withheld")}).strict();
const full=<T extends z.ZodTypeAny>(value:T)=>z.object({disclosure:z.literal("full"),value}).strict();
const masked=<T extends z.ZodTypeAny>(value:T)=>z.object({disclosure:z.literal("masked"),value}).strict();
const maskedText=z.string().min(1).max(320).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const addressValue=z.object({street:nullable(255),city:nullable(100),stateProvince:nullable(100),postalCode:nullable(30),country:z.string().regex(/^[A-Z]{2}$/).nullable()}).strict();
const maskedAddress=z.object({display:maskedText}).strict();
const assignmentValue=z.object({responsibleMembershipId:uuid.nullable(),responsibleMembershipVersion:version.nullable(),responsibleTeamId:uuid.nullable(),responsibleTeamVersion:version.nullable(),visibility:z.enum(["workspace","teams"]),visibleTeams:z.array(z.object({id:uuid,version}).strict()).max(20)}).strict();
const assignmentEnvelope=z.union([full(assignmentValue),withheld]);
const companyChannels=z.object({domain:nullable(253),website:httpsUrl,phone}).strict();
const contactChannels=z.object({primaryEmail:email,secondaryEmail:email.nullable(),directPhone:phone,mobilePhone:phone,linkedinUrl:httpsUrl}).strict();
const leadChannels=z.object({primaryEmail:email,secondaryEmail:email.nullable(),officePhone:phone,mobilePhone:phone,fax:phone,website:httpsUrl,twitterHandle:z.string().regex(/^@[A-Za-z0-9_]{1,15}$/).nullable()}).strict();
const maskedCompanyChannels=z.object({domain:maskedText.nullable(),website:maskedText.nullable(),phone:maskedText.nullable()}).strict();
const maskedContactChannels=z.object({primaryEmail:maskedText,secondaryEmail:maskedText.nullable(),directPhone:maskedText.nullable(),mobilePhone:maskedText.nullable(),linkedinUrl:maskedText.nullable()}).strict();
const maskedLeadChannels=z.object({primaryEmail:maskedText,secondaryEmail:maskedText.nullable(),officePhone:maskedText.nullable(),mobilePhone:maskedText.nullable(),fax:maskedText.nullable(),website:maskedText.nullable(),twitterHandle:maskedText.nullable()}).strict();
const revenueEnvelope=z.union([full(money),masked(z.object({display:maskedText}).strict()),withheld]);
const companyHierarchy=z.object({parent:z.object({id:uuid,label:clean(200),version}).strict().nullable()}).strict();
const contactHierarchy=z.object({company:z.object({id:uuid,label:clean(200),version,roleCode:z.enum(["employee","owner","executive","decision_maker","billing","technical","advisor","contractor","other"]),isPrimary:z.boolean()}).strict().nullable()}).strict();
const leadHierarchy=z.object({company:z.object({id:uuid,label:clean(200),version}).strict()}).strict();
const maskedHierarchy=z.object({display:maskedText.nullable()}).strict();
const notesEnvelope=z.union([full(z.object({listRoute:z.string().regex(/^\/api\/workspaces\/[0-9a-f-]{36}\/contacts\/[0-9a-f-]{36}\/notes(?:\?.*)?$/i).max(500)}).strict()),masked(z.object({available:z.boolean()}).strict()),withheld]);
export const screenProfileDetailV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...detailBase,
      kind: z.literal("company"),
      base:z.object({name:clean(200),industry:nullable(120),sizeBand:z.enum(["micro","small","medium","large","enterprise"]).nullable(),employeeCount:z.number().int().min(0).max(2147483647).nullable()}).strict(),
      categories:z.object({channels:z.union([full(companyChannels),masked(maskedCompanyChannels),withheld]),address:z.union([full(addressValue),masked(maskedAddress),withheld]),revenue:revenueEnvelope,hierarchy:z.union([full(companyHierarchy),masked(maskedHierarchy),withheld])}).strict(),
      assignment:assignmentEnvelope,
    })
    .strict(),
  z
    .object({
      ...detailBase,
      kind: z.literal("contact"),
      base:z.object({salutation:nullable(20),firstName:clean(100),lastName:clean(100),jobTitle:nullable(160),department:nullable(120),lifecycleStage:z.enum(["lead","marketing_qualified","sales_qualified","opportunity","customer","evangelist","other"])}).strict(),
      categories:z.object({channels:z.union([full(contactChannels),masked(maskedContactChannels),withheld]),address:z.union([full(addressValue),masked(maskedAddress),withheld]),notes:notesEnvelope,hierarchy:z.union([full(contactHierarchy),masked(maskedHierarchy),withheld])}).strict(),
      assignment:assignmentEnvelope,
    })
    .strict(),
  z
    .object({
      ...detailBase,
      kind: z.literal("lead"),
      base:z.object({salutation:nullable(20),firstName:clean(100),lastName:clean(100),jobTitle:nullable(160),source:z.enum(["website","referral","outbound","event","partner","social_media","import","manual","other"]),stageId:uuid,rating:z.enum(["hot","warm","cold"]).nullable(),industry:nullable(120),employeeCount:z.number().int().min(0).max(2147483647).nullable()}).strict(),
      identityReview:z.object({companyDimension:z.literal("resolved"),contactDimension:z.enum(["resolved","pending"])}).strict(),
      categories:z.object({channels:z.union([full(leadChannels),masked(maskedLeadChannels),withheld]),address:z.union([full(addressValue),masked(maskedAddress),withheld]),revenue:revenueEnvelope,consent:z.union([full(z.object({promotionalEmailOptOut:z.boolean(),recordedAt:z.string().datetime({offset:true}),source:z.enum(["manual","import","integration"])}).strict().nullable()),masked(z.object({display:maskedText}).strict()),withheld]),hierarchy:z.union([full(leadHierarchy),masked(maskedHierarchy),withheld])}).strict(),
      assignment:assignmentEnvelope,
    })
    .strict(),
]);
const profileResultBase = {
    contractVersion: z.literal("screen-profile-result.v1"),
    recordId: uuid,
    version,
    replayed: z.boolean(),
    requestId: uuid,
};
export const leadIdentityReviewOutcomeV1Schema = z.object({
  companyDimension: z.literal("resolved"),
  contactDimension: z.enum(["resolved", "pending"]),
}).strict();
export const screenProfileResultV1Schema = z.discriminatedUnion("kind", [
  z.object({...profileResultBase, kind:z.literal("company")}).strict(),
  z.object({...profileResultBase, kind:z.literal("contact")}).strict(),
  z.object({...profileResultBase, kind:z.literal("lead"), identityReview:leadIdentityReviewOutcomeV1Schema}).strict(),
]);
export const screenFormsErrorEnvelopeV1Schema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "authentication_required",
          "permission_required",
          "resource_not_found",
          "validation_failed",
          "unsupported_contract_version",
          "idempotency_conflict",
          "stale_version",
          "selection_unavailable",
          "authority_conflict",
          "screen_form_unavailable",
          "unexpected_error",
        ]),
        message: clean(200),
        retryable: z.boolean(),
        reconciliation: z
          .object({
            required: z.boolean(),
            action: z.enum([
              "none",
              "refetch_bootstrap",
              "refetch_record",
              "new_request",
              "retry_same_request",
              "clear_protected_state",
            ]),
          })
          .strict(),
        fields: z.array(z.string().max(80)).max(32).optional(),
        zeroPartialEffects: z.literal(true),
      })
      .strict(),
    requestId: uuid,
  })
  .strict()
  .superRefine((value, context) => {
    const expected = {
      authentication_required: [false, true, "clear_protected_state"],
      permission_required: [false, true, "clear_protected_state"],
      resource_not_found: [false, true, "clear_protected_state"],
      authority_conflict: [false, true, "clear_protected_state"],
      validation_failed: [false, false, "none"],
      unsupported_contract_version: [false, false, "none"],
      stale_version: [false, true, "refetch_record"],
      selection_unavailable: [false, true, "refetch_bootstrap"],
      idempotency_conflict: [false, true, "new_request"],
      screen_form_unavailable: [true, true, "retry_same_request"],
      unexpected_error: [true, true, "retry_same_request"],
    } as const;
    const [retryable, required, action] = expected[value.error.code];
    if (
      value.error.retryable !== retryable ||
      value.error.reconciliation.required !== required ||
      value.error.reconciliation.action !== action
    )
      context.addIssue({
        code: "custom",
        message: "invalid_screen_form_reconciliation",
        path: ["error"],
      });
  });

export type CompanyScreenCreateCommandV2 = z.infer<
  typeof companyScreenCreateCommandV2Schema
>;
export type CompanyScreenEditCommandV2 = z.infer<
  typeof companyScreenEditCommandV2Schema
>;
export type ContactScreenCreateCommandV2 = z.infer<
  typeof contactScreenCreateCommandV2Schema
>;
export type ContactScreenEditCommandV2 = z.infer<
  typeof contactScreenEditCommandV2Schema
>;
export type LeadScreenCreateCommandV2 = z.infer<
  typeof leadScreenCreateCommandV2Schema
>;
export type LeadScreenEditCommandV2 = z.infer<
  typeof leadScreenEditCommandV2Schema
>;
export type ScreenFormOptionsQueryV1 = z.infer<typeof screenFormOptionsQueryV1Schema>;
