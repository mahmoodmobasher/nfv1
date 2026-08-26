import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: id(),
    primaryEmailNormalized: text("primary_email_normalized").unique(),
    primaryEmailDisplay: text("primary_email_display"),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("pending_verification"),
    securityVersion: integer("security_version").notNull().default(1),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("users_status_check", sql`${table.status} in ('pending_verification', 'active', 'suspended', 'deleted')`),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    appearance: text("appearance").notNull().default("system"),
    locale: text("locale"),
    timeZone: text("time_zone"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("user_preferences_appearance_check", sql`${table.appearance} in ('system', 'light', 'dark')`),
    check("user_preferences_locale_check", sql`${table.locale} is null or length(btrim(${table.locale})) between 2 and 35`),
    check("user_preferences_time_zone_check", sql`${table.timeZone} is null or length(btrim(${table.timeZone})) between 1 and 64`),
    check("user_preferences_version_check", sql`${table.version} > 0`),
  ],
);

export const identityCredentials = pgTable(
  "identity_credentials",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    passwordHash: text("password_hash"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("identity_provider_subject_uq").on(table.provider, table.providerSubject),
    uniqueIndex("identity_password_user_uq").on(table.userId).where(sql`${table.provider} = 'password'`),
    check("identity_credentials_provider_check", sql`${table.provider} in ('password', 'google')`),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("provisioning"),
    planCode: text("plan_code").notNull(),
    billingCadence: text("billing_cadence").notNull(),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("workspaces_status_check", sql`${table.status} in ('provisioning', 'active', 'suspended', 'closed')`),
    check("workspaces_billing_cadence_check", sql`${table.billingCadence} in ('monthly', 'annual', 'sales_managed')`),
    check("workspaces_version_check", sql`${table.version} > 0`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    permissions: jsonb("permissions").notNull().default({}),
    policyVersion: text("policy_version").notNull().default("tenant-admin-v1"),
    version: integer("version").notNull().default(1),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("roles_workspace_code_uq").on(table.workspaceId, table.code),
    uniqueIndex("roles_workspace_id_id_uq").on(table.workspaceId, table.id),
    check("roles_code_check", sql`${table.code} in ('owner', 'admin', 'member')`),
    check("roles_version_check", sql`${table.version} > 0`),
  ],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("membership_workspace_user_uq").on(table.workspaceId, table.userId),
    uniqueIndex("membership_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("membership_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "membership_workspace_role_fk",
      columns: [table.workspaceId, table.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }),
    check("workspace_memberships_status_check", sql`${table.status} in ('active', 'suspended', 'removed')`),
    check("workspace_memberships_version_check", sql`${table.version} > 0`),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("teams_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("teams_workspace_name_uq").on(table.workspaceId, table.nameNormalized),
    foreignKey({ name: "teams_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("teams_status_check", sql`${table.status} in ('active', 'archived')`),
    check("teams_version_check", sql`${table.version} > 0`),
    check("teams_name_check", sql`length(btrim(${table.name})) between 1 and 100 and ${table.nameNormalized}=lower(btrim(${table.nameNormalized}))`),
  ],
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    workspaceId: uuid("workspace_id").notNull(),
    teamId: uuid("team_id").notNull(),
    workspaceMembershipId: uuid("workspace_membership_id").notNull(),
    version: integer("version").notNull().default(1),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ name: "team_memberships_pk", columns: [table.teamId, table.workspaceMembershipId] }),
    uniqueIndex("team_memberships_workspace_uq").on(table.workspaceId, table.teamId, table.workspaceMembershipId),
    foreignKey({ name: "team_memberships_workspace_team_fk", columns: [table.workspaceId, table.teamId], foreignColumns: [teams.workspaceId, teams.id] }),
    foreignKey({ name: "team_memberships_workspace_member_fk", columns: [table.workspaceId, table.workspaceMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "team_memberships_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("team_memberships_version_check", sql`${table.version} > 0`),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    emailDisplay: text("email_display").notNull(),
    roleId: uuid("role_id").notNull(),
    status: text("status").notNull().default("pending"),
    tokenHash: text("token_hash").notNull().unique(),
    tokenGeneration: integer("token_generation").notNull().default(1),
    version: integer("version").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    acceptedMembershipId: uuid("accepted_membership_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByMembershipId: uuid("revoked_by_membership_id"),
    invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_invitations_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("workspace_invitations_pending_email_uq").on(table.workspaceId, table.emailNormalized).where(sql`${table.status}='pending'`),
    index("workspace_invitations_status_idx").on(table.workspaceId, table.status, table.createdAt, table.id),
    index("workspace_invitations_email_idx").on(table.workspaceId, table.emailNormalized),
    index("workspace_invitations_expiry_idx").on(table.status, table.expiresAt),
    foreignKey({ name: "workspace_invitations_role_fk", columns: [table.workspaceId, table.roleId], foreignColumns: [roles.workspaceId, roles.id] }),
    foreignKey({ name: "workspace_invitations_inviter_fk", columns: [table.workspaceId, table.invitedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "workspace_invitations_revoker_fk", columns: [table.workspaceId, table.revokedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "workspace_invitations_accepted_membership_fk", columns: [table.workspaceId, table.acceptedMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("workspace_invitations_status_check", sql`${table.status} in ('pending','accepted','revoked','expired','superseded')`),
    check("workspace_invitations_email_check", sql`length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized}=lower(btrim(${table.emailNormalized}))`),
    check("workspace_invitations_generation_check", sql`${table.tokenGeneration}>0 and ${table.version}>0`),
    check("workspace_invitations_expiry_check", sql`${table.expiresAt}>${table.createdAt}`),
    check("workspace_invitations_terminal_check", sql`(${table.status}='accepted' and ${table.acceptedAt} is not null and ${table.acceptedByUserId} is not null and ${table.acceptedMembershipId} is not null and ${table.revokedAt} is null and ${table.revokedByMembershipId} is null) or (${table.status}='revoked' and ${table.revokedAt} is not null and ${table.revokedByMembershipId} is not null and ${table.acceptedAt} is null and ${table.acceptedByUserId} is null and ${table.acceptedMembershipId} is null) or (${table.status} in ('pending','expired','superseded') and ${table.acceptedAt} is null and ${table.acceptedByUserId} is null and ${table.acceptedMembershipId} is null and (${table.status}<>'pending' or (${table.revokedAt} is null and ${table.revokedByMembershipId} is null)))`),
  ],
);

export const workspaceInvitationTeams = pgTable(
  "workspace_invitation_teams",
  {
    workspaceId: uuid("workspace_id").notNull(),
    invitationId: uuid("invitation_id").notNull(),
    teamId: uuid("team_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "workspace_invitation_teams_pk", columns: [table.invitationId, table.teamId] }),
    uniqueIndex("workspace_invitation_teams_workspace_uq").on(table.workspaceId, table.invitationId, table.teamId),
    foreignKey({ name: "workspace_invitation_teams_invitation_fk", columns: [table.workspaceId, table.invitationId], foreignColumns: [workspaceInvitations.workspaceId, workspaceInvitations.id] }),
    foreignKey({ name: "workspace_invitation_teams_team_fk", columns: [table.workspaceId, table.teamId], foreignColumns: [teams.workspaceId, teams.id] }),
  ],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("pipeline_stages_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("pipeline_stages_workspace_position_uq").on(table.workspaceId, table.position),
    check("pipeline_stages_name_check", sql`length(btrim(${table.name})) between 1 and 80`),
    check("pipeline_stages_position_check", sql`${table.position} >= 0`),
    check("pipeline_stages_status_check", sql`${table.status} in ('active', 'archived')`),
  ],
);

export const leadLifecycleDefinitions = pgTable(
  "lead_lifecycle_definitions",
  {
    id: id(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    displayOrder: integer("display_order").notNull(),
    isTerminal: boolean("is_terminal").notNull().default(false),
    status: text("status").notNull().default("active"),
    contractVersion: text("contract_version").notNull().default("p1a-lifecycle-v1"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lead_lifecycle_definitions_code_uq").on(table.code),
    uniqueIndex("lead_lifecycle_definitions_order_uq").on(table.displayOrder),
    check("lead_lifecycle_definitions_code_check", sql`${table.code} in ('new','working','qualified','disqualified','converted')`),
    check("lead_lifecycle_definitions_label_check", sql`length(btrim(${table.label})) between 1 and 80`),
    check("lead_lifecycle_definitions_order_check", sql`${table.displayOrder} >= 0`),
    check("lead_lifecycle_definitions_status_check", sql`${table.status} in ('active','archived')`),
    check("lead_lifecycle_definitions_version_check", sql`${table.version} > 0`),
  ],
);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    domainNormalized: text("domain_normalized"),
    normalizationVersion: text("normalization_version").notNull().default("p1a-identity-v1"),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("companies_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("companies_workspace_name_idx").on(table.workspaceId, table.nameNormalized, table.id),
    index("companies_workspace_domain_idx").on(table.workspaceId, table.domainNormalized, table.id),
    check("companies_name_check", sql`length(btrim(${table.displayName})) between 1 and 200 and length(${table.nameNormalized}) between 1 and 200`),
    check("companies_status_check", sql`${table.status} in ('active','archived')`),
    check("companies_version_check", sql`${table.version} > 0`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    personNameNormalized: text("person_name_normalized").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    emailDisplay: text("email_display"),
    emailNormalized: text("email_normalized"),
    phoneDisplay: text("phone_display"),
    phoneNormalized: text("phone_normalized"),
    phoneCountryCodeUsed: text("phone_country_code_used"),
    normalizationVersion: text("normalization_version").notNull().default("p1a-identity-v1"),
    companyId: uuid("company_id"),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("contacts_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("contacts_workspace_email_idx").on(table.workspaceId, table.emailNormalized, table.id),
    index("contacts_workspace_phone_idx").on(table.workspaceId, table.phoneNormalized, table.id),
    index("contacts_workspace_name_company_idx").on(table.workspaceId, table.personNameNormalized, table.companyId, table.id),
    foreignKey({ name: "contacts_workspace_company_fk", columns: [table.workspaceId, table.companyId], foreignColumns: [companies.workspaceId, companies.id] }),
    check("contacts_name_check", sql`length(btrim(${table.displayName})) between 1 and 200`),
    check("contacts_normalized_name_check", sql`length(${table.personNameNormalized}) between 1 and 200 and ${table.personNameNormalized}=btrim(${table.personNameNormalized})`),
    check("contacts_email_pair_check", sql`(${table.emailDisplay} is null) = (${table.emailNormalized} is null)`),
    check("contacts_email_check", sql`${table.emailNormalized} is null or (length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized}=lower(btrim(${table.emailNormalized})))`),
    check("contacts_phone_pair_check", sql`(${table.phoneDisplay} is null and ${table.phoneNormalized} is null and ${table.phoneCountryCodeUsed} is null) or (${table.phoneDisplay} is not null and ${table.phoneNormalized} is not null and length(btrim(${table.phoneCountryCodeUsed})) between 2 and 16)`),
    check("contacts_identity_check", sql`${table.emailNormalized} is not null or ${table.phoneNormalized} is not null or length(btrim(${table.displayName})) > 0`),
    check("contacts_status_check", sql`${table.status} in ('active','archived')`),
    check("contacts_version_check", sql`${table.version} > 0`),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    personNameNormalized: text("person_name_normalized").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    emailNormalized: text("email_normalized"),
    emailDisplay: text("email_display"),
    company: text("company"),
    phone: text("phone"), // preserved original/display value
    phoneNormalized: text("phone_normalized"),
    phoneCountryCodeUsed: text("phone_country_code_used"),
    normalizationVersion: text("normalization_version").notNull().default("p1a-identity-v1"),
    source: text("source").notNull(),
    originalSourceCategory: text("original_source_category").notNull(),
    originalSourcePlatform: text("original_source_platform"),
    originalSourceMedium: text("original_source_medium").notNull().default("unknown"),
    originalSourceDetail: jsonb("original_source_detail").notNull().default({}),
    originalCampaignContext: jsonb("original_campaign_context").notNull().default({}),
    attributionContractVersion: text("attribution_contract_version").notNull().default("p1a-attribution-v1"),
    intakeChannel: text("intake_channel").notNull().default("manual"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    status: text("status").notNull().default("open"),
    lifecycleDefinitionId: uuid("lifecycle_definition_id").references(() => leadLifecycleDefinitions.id),
    identityReviewStatus: text("identity_review_status").notNull().default("not_required"),
    contactId: uuid("contact_id"),
    companyId: uuid("company_id"),
    stageId: uuid("stage_id").notNull(),
    ownerMembershipId: uuid("owner_membership_id"),
    responsibleTeamId: uuid("responsible_team_id"),
    visibility: text("visibility").notNull().default("workspace"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leads_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("leads_workspace_updated_idx").on(table.workspaceId, table.updatedAt, table.id),
    index("leads_workspace_email_idx").on(table.workspaceId, table.emailNormalized),
    index("leads_workspace_phone_idx").on(table.workspaceId, table.phoneNormalized, table.id),
    index("leads_workspace_name_company_idx").on(table.workspaceId, table.personNameNormalized, table.companyId, table.id),
    index("leads_workspace_lifecycle_idx").on(table.workspaceId, table.lifecycleDefinitionId, table.updatedAt, table.id),
    index("leads_workspace_review_idx").on(table.workspaceId, table.identityReviewStatus, table.updatedAt, table.id),
    foreignKey({ name: "leads_workspace_stage_fk", columns: [table.workspaceId, table.stageId], foreignColumns: [pipelineStages.workspaceId, pipelineStages.id] }),
    foreignKey({ name: "leads_workspace_owner_fk", columns: [table.workspaceId, table.ownerMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "leads_workspace_responsible_team_fk", columns: [table.workspaceId, table.responsibleTeamId], foreignColumns: [teams.workspaceId, teams.id] }),
    foreignKey({ name: "leads_workspace_contact_fk", columns: [table.workspaceId, table.contactId], foreignColumns: [contacts.workspaceId, contacts.id] }),
    foreignKey({ name: "leads_workspace_company_fk", columns: [table.workspaceId, table.companyId], foreignColumns: [companies.workspaceId, companies.id] }),
    check("leads_name_check", sql`length(btrim(${table.displayName})) between 1 and 200 and (${table.firstName} is null or length(btrim(${table.firstName})) between 1 and 100) and (${table.lastName} is null or length(btrim(${table.lastName})) between 1 and 100)`),
    check("leads_normalized_name_check", sql`length(${table.personNameNormalized}) between 1 and 200 and ${table.personNameNormalized}=btrim(${table.personNameNormalized})`),
    check("leads_email_pair_check", sql`(${table.emailDisplay} is null) = (${table.emailNormalized} is null)`),
    check("leads_email_check", sql`${table.emailNormalized} is null or (length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized}=lower(btrim(${table.emailNormalized})))`),
    check("leads_identity_check", sql`${table.emailNormalized} is not null or ${table.phoneNormalized} is not null`),
    check("leads_phone_pair_check", sql`(${table.phone} is null and ${table.phoneNormalized} is null and ${table.phoneCountryCodeUsed} is null) or (${table.lifecycleDefinitionId} is null and ${table.phone} is not null and ${table.phoneNormalized} is null and ${table.phoneCountryCodeUsed} is null) or (${table.phone} is not null and ${table.phoneNormalized} is not null and length(btrim(${table.phoneCountryCodeUsed})) between 2 and 16)`),
    check("leads_company_check", sql`${table.company} is null or length(btrim(${table.company})) between 1 and 160`),
    check("leads_source_check", sql`${table.source} in ('website','referral','outbound','event','partner','social_media','import','manual','other')`),
    check("leads_original_source_check", sql`${table.originalSourceCategory} in ('website','referral','outbound','event','partner','social_media','import','manual','other')`),
    check("leads_social_platform_check", sql`coalesce((${table.originalSourceCategory}='social_media' and ${table.originalSourcePlatform} in ('tiktok','instagram','facebook','linkedin','x','youtube','other_social') and (${table.originalSourcePlatform}<>'other_social' or length(btrim(coalesce(${table.originalSourceDetail}->>'platform_context',''))) between 1 and 200)) or (${table.originalSourceCategory}<>'social_media' and ${table.originalSourcePlatform} is null),false)`),
    check("leads_source_medium_check", sql`${table.originalSourceMedium} in ('organic','paid','unknown')`),
    check("leads_source_detail_check", sql`jsonb_typeof(${table.originalSourceDetail})='object' and octet_length(${table.originalSourceDetail}::text)<=2048`),
    check("leads_campaign_context_check", sql`jsonb_typeof(${table.originalCampaignContext})='object' and octet_length(${table.originalCampaignContext}::text)<=2048`),
    check("leads_intake_channel_check", sql`${table.intakeChannel} in ('web_form','manual','csv','spreadsheet','future_api','future_integration')`),
    check("leads_status_check", sql`${table.status} in ('open', 'won', 'lost')`),
    check("leads_review_status_check", sql`${table.identityReviewStatus} in ('not_required','pending','resolved')`),
    check("leads_visibility_check", sql`${table.visibility} in ('workspace', 'teams')`),
    check("leads_version_check", sql`${table.version} > 0`),
  ],
);

export const leadIntakes = pgTable(
  "lead_intakes",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    operation: text("operation").notNull().default("lead-inquiry-intake.v1"),
    intakeChannel: text("intake_channel").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorMembershipId: uuid("actor_membership_id"),
    requestHash: text("request_hash").notNull(),
    contractVersion: text("contract_version").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    attributionContractVersion: text("attribution_contract_version").notNull(),
    sourceCategory: text("source_category").notNull(),
    sourcePlatform: text("source_platform"),
    sourceMedium: text("source_medium").notNull(),
    sourceDetail: jsonb("source_detail").notNull().default({}),
    campaignContext: jsonb("campaign_context").notNull().default({}),
    state: text("state").notNull().default("pending"),
    leadId: uuid("lead_id"),
    outcome: jsonb("outcome"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lead_intakes_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("lead_intakes_idempotency_uq").on(table.workspaceId, table.operation, table.intakeChannel, table.idempotencyKey),
    uniqueIndex("lead_intakes_lead_uq").on(table.workspaceId, table.leadId).where(sql`${table.leadId} is not null`),
    index("lead_intakes_workspace_state_idx").on(table.workspaceId, table.state, table.createdAt, table.id),
    foreignKey({ name: "lead_intakes_workspace_lead_fk", columns: [table.workspaceId, table.leadId], foreignColumns: [leads.workspaceId, leads.id] }),
    foreignKey({ name: "lead_intakes_workspace_actor_fk", columns: [table.workspaceId, table.actorMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("lead_intakes_operation_check", sql`${table.operation}='lead-inquiry-intake.v1'`),
    check("lead_intakes_actor_check", sql`${table.intakeChannel} not in ('manual','csv','spreadsheet') or ${table.actorMembershipId} is not null`),
    check("lead_intakes_channel_check", sql`${table.intakeChannel} in ('manual','csv','spreadsheet','web_form','future_api','future_integration')`),
    check("lead_intakes_key_check", sql`length(${table.idempotencyKey}) between 16 and 128 and length(${table.requestHash}) between 32 and 128`),
    check("lead_intakes_source_check", sql`${table.sourceCategory} in ('website','referral','outbound','event','partner','social_media','import','manual','other')`),
    check("lead_intakes_social_platform_check", sql`coalesce((${table.sourceCategory}='social_media' and ${table.sourcePlatform} in ('tiktok','instagram','facebook','linkedin','x','youtube','other_social') and (${table.sourcePlatform}<>'other_social' or length(btrim(coalesce(${table.sourceDetail}->>'platform_context',''))) between 1 and 200)) or (${table.sourceCategory}<>'social_media' and ${table.sourcePlatform} is null),false)`),
    check("lead_intakes_medium_check", sql`${table.sourceMedium} in ('organic','paid','unknown')`),
    check("lead_intakes_detail_check", sql`jsonb_typeof(${table.sourceDetail})='object' and octet_length(${table.sourceDetail}::text)<=2048`),
    check("lead_intakes_campaign_check", sql`jsonb_typeof(${table.campaignContext})='object' and octet_length(${table.campaignContext}::text)<=2048`),
    check("lead_intakes_state_check", sql`${table.state} in ('pending','committed')`),
    check("lead_intakes_outcome_check", sql`(${table.state}='pending' and ${table.leadId} is null and ${table.outcome} is null) or (${table.state}='committed' and ${table.leadId} is not null and jsonb_typeof(${table.outcome})='object')`),
    check("lead_intakes_version_check", sql`${table.version} > 0`),
  ],
);

export const leadIdentityReviews = pgTable(
  "lead_identity_reviews",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    state: text("state").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByMembershipId: uuid("resolved_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lead_identity_reviews_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("lead_identity_reviews_pending_lead_uq").on(table.workspaceId, table.leadId).where(sql`${table.state}='pending'`),
    index("lead_identity_reviews_workspace_state_idx").on(table.workspaceId, table.state, table.updatedAt, table.id),
    foreignKey({ name: "lead_identity_reviews_workspace_intake_fk", columns: [table.workspaceId, table.intakeId], foreignColumns: [leadIntakes.workspaceId, leadIntakes.id] }),
    foreignKey({ name: "lead_identity_reviews_workspace_lead_fk", columns: [table.workspaceId, table.leadId], foreignColumns: [leads.workspaceId, leads.id] }),
    foreignKey({ name: "lead_identity_reviews_workspace_resolver_fk", columns: [table.workspaceId, table.resolvedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("lead_identity_reviews_state_check", sql`${table.state} in ('pending','resolved')`),
    check("lead_identity_reviews_resolution_check", sql`(${table.state}='pending' and ${table.resolvedAt} is null and ${table.resolvedByMembershipId} is null) or (${table.state}='resolved' and ${table.resolvedAt} is not null and ${table.resolvedByMembershipId} is not null)`),
    check("lead_identity_reviews_version_check", sql`${table.version} > 0`),
  ],
);

export const leadIdentityCandidates = pgTable(
  "lead_identity_candidates",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").notNull(),
    contactId: uuid("contact_id"),
    companyId: uuid("company_id"),
    evidenceKind: text("evidence_kind").notNull(),
    evidenceStrength: text("evidence_strength").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    targetVersion: integer("target_version").notNull(),
    evidenceMetadata: jsonb("evidence_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_identity_candidates_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("lead_identity_candidates_workspace_review_id_uq").on(table.workspaceId, table.reviewId, table.id),
    uniqueIndex("lead_identity_candidates_contact_uq").on(table.workspaceId, table.reviewId, table.contactId, table.evidenceKind, table.normalizationVersion).where(sql`${table.contactId} is not null`),
    uniqueIndex("lead_identity_candidates_company_uq").on(table.workspaceId, table.reviewId, table.companyId, table.evidenceKind, table.normalizationVersion).where(sql`${table.companyId} is not null`),
    index("lead_identity_candidates_review_idx").on(table.workspaceId, table.reviewId, table.evidenceStrength, table.evidenceKind, table.id),
    foreignKey({ name: "lead_identity_candidates_workspace_review_fk", columns: [table.workspaceId, table.reviewId], foreignColumns: [leadIdentityReviews.workspaceId, leadIdentityReviews.id] }),
    foreignKey({ name: "lead_identity_candidates_workspace_contact_fk", columns: [table.workspaceId, table.contactId], foreignColumns: [contacts.workspaceId, contacts.id] }),
    foreignKey({ name: "lead_identity_candidates_workspace_company_fk", columns: [table.workspaceId, table.companyId], foreignColumns: [companies.workspaceId, companies.id] }),
    check("lead_identity_candidates_target_check", sql`((${table.contactId} is not null)::int + (${table.companyId} is not null)::int)=1`),
    check("lead_identity_candidates_evidence_check", sql`${table.evidenceKind} in ('email','phone','name_company') and ${table.evidenceStrength} in ('strong','supplementary','probable')`),
    check("lead_identity_candidates_strength_check", sql`(${table.evidenceKind}='email' and ${table.evidenceStrength}='strong') or (${table.evidenceKind}='phone' and ${table.evidenceStrength}='supplementary') or (${table.evidenceKind}='name_company' and ${table.evidenceStrength}='probable')`),
    check("lead_identity_candidates_version_check", sql`${table.targetVersion} > 0`),
    check("lead_identity_candidates_metadata_check", sql`jsonb_typeof(${table.evidenceMetadata})='object' and (${table.evidenceMetadata} - array['match_key_version']::text[])='{}'::jsonb`),
  ],
);

export const leadIdentityDecisions = pgTable(
  "lead_identity_decisions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    operation: text("operation").notNull().default("lead-identity-review-decision.v1"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    requestId: uuid("request_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    supersedesDecisionId: uuid("supersedes_decision_id"),
    governingOutcome: text("governing_outcome").notNull(),
    contactAction: text("contact_action"),
    companyAction: text("company_action"),
    contactId: uuid("contact_id"),
    companyId: uuid("company_id"),
    contactCandidateId: uuid("contact_candidate_id"),
    companyCandidateId: uuid("company_candidate_id"),
    contactTargetVersion: integer("contact_target_version"),
    companyTargetVersion: integer("company_target_version"),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    expectedLeadVersion: integer("expected_lead_version").notNull(),
    expectedReviewVersion: integer("expected_review_version").notNull(),
    expectedIntakeVersion: integer("expected_intake_version").notNull(),
    resultLeadVersion: integer("result_lead_version").notNull(),
    resultReviewVersion: integer("result_review_version").notNull(),
    contractVersion: text("contract_version").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_identity_decisions_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("lead_identity_decisions_workspace_intake_id_uq").on(table.workspaceId, table.intakeId, table.id),
    uniqueIndex("lead_identity_decisions_idempotency_uq").on(table.workspaceId, table.operation, table.idempotencyKey),
    index("lead_identity_decisions_review_idx").on(table.workspaceId, table.reviewId, table.createdAt, table.id),
    foreignKey({ name: "lead_identity_decisions_workspace_intake_fk", columns: [table.workspaceId, table.intakeId], foreignColumns: [leadIntakes.workspaceId, leadIntakes.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_review_fk", columns: [table.workspaceId, table.reviewId], foreignColumns: [leadIdentityReviews.workspaceId, leadIdentityReviews.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_contact_fk", columns: [table.workspaceId, table.contactId], foreignColumns: [contacts.workspaceId, contacts.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_company_fk", columns: [table.workspaceId, table.companyId], foreignColumns: [companies.workspaceId, companies.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_contact_candidate_fk", columns: [table.workspaceId, table.reviewId, table.contactCandidateId], foreignColumns: [leadIdentityCandidates.workspaceId, leadIdentityCandidates.reviewId, leadIdentityCandidates.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_company_candidate_fk", columns: [table.workspaceId, table.reviewId, table.companyCandidateId], foreignColumns: [leadIdentityCandidates.workspaceId, leadIdentityCandidates.reviewId, leadIdentityCandidates.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_actor_fk", columns: [table.workspaceId, table.actorMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "lead_identity_decisions_workspace_supersedes_fk", columns: [table.workspaceId, table.intakeId, table.supersedesDecisionId], foreignColumns: [table.workspaceId, table.intakeId, table.id] }),
    check("lead_identity_decisions_operation_check", sql`${table.operation}='lead-identity-review-decision.v1' and length(${table.idempotencyKey}) between 16 and 128 and length(${table.requestHash}) between 32 and 128`),
    check("lead_identity_decisions_outcome_check", sql`${table.governingOutcome} in ('hold','resolve')`),
    check("lead_identity_decisions_actions_check", sql`(${table.governingOutcome}='hold' and num_nonnulls(${table.contactAction},${table.companyAction},${table.contactId},${table.companyId},${table.contactCandidateId},${table.companyCandidateId},${table.contactTargetVersion},${table.companyTargetVersion})=0) or (${table.governingOutcome}='resolve' and ${table.contactAction} in ('create','link','dismiss') and ${table.companyAction} in ('create','link','dismiss') and ((${table.contactAction}='dismiss' and num_nonnulls(${table.contactId},${table.contactCandidateId},${table.contactTargetVersion})=0) or (${table.contactAction}='create' and ${table.contactId} is not null and ${table.contactCandidateId} is null and ${table.contactTargetVersion}>0) or (${table.contactAction}='link' and ${table.contactId} is not null and ${table.contactCandidateId} is not null and ${table.contactTargetVersion}>0)) and ((${table.companyAction}='dismiss' and num_nonnulls(${table.companyId},${table.companyCandidateId},${table.companyTargetVersion})=0) or (${table.companyAction}='create' and ${table.companyId} is not null and ${table.companyCandidateId} is null and ${table.companyTargetVersion}>0) or (${table.companyAction}='link' and ${table.companyId} is not null and ${table.companyCandidateId} is not null and ${table.companyTargetVersion}>0)))`),
    check("lead_identity_decisions_version_check", sql`${table.expectedLeadVersion}>0 and ${table.expectedReviewVersion}>0 and ${table.expectedIntakeVersion}>0 and ${table.resultLeadVersion}>0 and ${table.resultReviewVersion}>0`),
  ],
);

export const leadIdentityDecisionHeads = pgTable(
  "lead_identity_decision_heads",
  {
    workspaceId: uuid("workspace_id").notNull(),
    intakeId: uuid("intake_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "lead_identity_decision_heads_pk", columns: [table.workspaceId, table.intakeId] }),
    uniqueIndex("lead_identity_decision_heads_decision_uq").on(table.workspaceId, table.decisionId),
    foreignKey({ name: "lead_identity_decision_heads_workspace_intake_fk", columns: [table.workspaceId, table.intakeId], foreignColumns: [leadIntakes.workspaceId, leadIntakes.id] }),
    foreignKey({ name: "lead_identity_decision_heads_workspace_decision_fk", columns: [table.workspaceId, table.intakeId, table.decisionId], foreignColumns: [leadIdentityDecisions.workspaceId, leadIdentityDecisions.intakeId, leadIdentityDecisions.id] }),
    check("lead_identity_decision_heads_version_check", sql`${table.version}>0`),
  ],
);

export const leadVisibleTeams = pgTable(
  "lead_visible_teams",
  {
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    teamId: uuid("team_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "lead_visible_teams_pk", columns: [table.leadId, table.teamId] }),
    foreignKey({ name: "lead_visible_teams_lead_fk", columns: [table.workspaceId, table.leadId], foreignColumns: [leads.workspaceId, leads.id] }),
    foreignKey({ name: "lead_visible_teams_team_fk", columns: [table.workspaceId, table.teamId], foreignColumns: [teams.workspaceId, teams.id] }),
  ],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("lead_activities_lead_idx").on(table.workspaceId, table.leadId, table.createdAt),
    foreignKey({ name: "lead_activities_lead_fk", columns: [table.workspaceId, table.leadId], foreignColumns: [leads.workspaceId, leads.id] }),
    foreignKey({ name: "lead_activities_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("lead_activities_kind_check", sql`${table.kind} in ('note', 'created', 'updated', 'stage_changed', 'status_changed')`),
    check("lead_activities_body_check", sql`length(btrim(${table.body})) between 1 and 4000`),
  ],
);

export const activityRecords = pgTable(
  "activity_records",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "no action" }),
    origin: text("origin").notNull().default("manual"),
    kind: text("kind").notNull(),
    direction: text("direction"),
    outcome: text("outcome"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    subject: text("subject").notNull(),
    details: text("details"),
    version: integer("version").notNull().default(1),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("activity_records_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("activity_records_workspace_timeline_idx").on(table.workspaceId, table.occurredAt.desc(), table.id.desc()),
    index("activity_records_workspace_kind_timeline_idx").on(table.workspaceId, table.kind, table.occurredAt.desc(), table.id.desc()),
    foreignKey({ name: "activity_records_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("activity_records_origin_check", sql`${table.origin}='manual'`),
    check("activity_records_kind_check", sql`${table.kind} in ('note','call','meeting','email','message','other')`),
    check("activity_records_direction_check", sql`${table.direction} is null or ${table.direction} in ('inbound','outbound','internal')`),
    check("activity_records_outcome_check", sql`${table.outcome} is null or ${table.outcome} in ('completed','connected','no_answer','left_message','rescheduled','cancelled','follow_up_required','other')`),
    check("activity_records_duration_check", sql`${table.durationMinutes} is null or ${table.durationMinutes} between 1 and 1440`),
    check("activity_records_subject_check", sql`length(btrim(${table.subject})) between 1 and 200`),
    check("activity_records_details_check", sql`${table.details} is null or length(btrim(${table.details})) between 1 and 10000`),
    check("activity_records_version_check", sql`${table.version}>0`),
  ],
);

export const activityRecordReferences = pgTable(
  "activity_record_references",
  {
    workspaceId: uuid("workspace_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "activity_record_references_pk", columns: [table.workspaceId, table.activityId] }),
    index("activity_record_references_record_lookup_idx").on(table.workspaceId, table.recordType, table.recordId, table.activityId),
    foreignKey({ name: "activity_record_references_activity_fk", columns: [table.workspaceId, table.activityId], foreignColumns: [activityRecords.workspaceId, activityRecords.id] }),
    check("activity_record_references_type_check", sql`${table.recordType}='crm.lead'`),
  ],
);

export const noteRecords = pgTable(
  "note_records",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "no action" }),
    lifecycle: text("lifecycle").notNull().default("active"),
    version: integer("version").notNull().default(1),
    currentRevisionNumber: integer("current_revision_number").notNull().default(1),
    governingOperationId: uuid("governing_operation_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    updatedByMembershipId: uuid("updated_by_membership_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByMembershipId: uuid("archived_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("note_records_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("note_records_workspace_lifecycle_updated_idx").on(table.workspaceId, table.lifecycle, table.updatedAt.desc(), table.id.desc()),
    foreignKey({ name: "note_records_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "note_records_workspace_updater_fk", columns: [table.workspaceId, table.updatedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "note_records_workspace_archiver_fk", columns: [table.workspaceId, table.archivedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("note_records_lifecycle_check", sql`${table.lifecycle} in ('active','archived')`),
    check("note_records_version_check", sql`${table.version}>0 and ${table.currentRevisionNumber}=${table.version}`),
    check("note_records_lifecycle_metadata_check", sql`(${table.lifecycle}='active' and num_nonnulls(${table.archivedAt},${table.archivedByMembershipId})=0) or (${table.lifecycle}='archived' and ${table.archivedAt} is not null and ${table.archivedByMembershipId} is not null)`),
  ],
);

export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    noteId: uuid("note_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    governingOperationId: uuid("governing_operation_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("note_revisions_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("note_revisions_workspace_note_number_uq").on(table.workspaceId, table.noteId, table.revisionNumber),
    foreignKey({ name: "note_revisions_note_fk", columns: [table.workspaceId, table.noteId], foreignColumns: [noteRecords.workspaceId, noteRecords.id] }),
    foreignKey({ name: "note_revisions_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("note_revisions_number_check", sql`${table.revisionNumber}>0`),
    check("note_revisions_content_check", sql`(${table.subject} is null or char_length(btrim(${table.subject})) between 1 and 200) and char_length(btrim(${table.body})) between 1 and 20000`),
  ],
);

export const noteRecordReferences = pgTable(
  "note_record_references",
  {
    workspaceId: uuid("workspace_id").notNull(),
    noteId: uuid("note_id").notNull(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    relationshipRole: text("relationship_role").notNull().default("related"),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "note_record_references_pk", columns: [table.workspaceId, table.noteId, table.recordType, table.recordId] }),
    index("note_record_references_target_idx").on(table.workspaceId, table.recordType, table.recordId, table.noteId),
    foreignKey({ name: "note_record_references_note_fk", columns: [table.workspaceId, table.noteId], foreignColumns: [noteRecords.workspaceId, noteRecords.id] }),
    foreignKey({ name: "note_record_references_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("note_record_references_type_check", sql`${table.recordType} in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')`),
    check("note_record_references_role_check", sql`${table.relationshipRole}='related'`),
  ],
);

export const documentRecords = pgTable(
  "document_records",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "no action" }),
    lifecycle: text("lifecycle").notNull().default("active"),
    availability: text("availability").notNull().default("awaiting_upload"),
    version: integer("version").notNull().default(1),
    currentContentVersion: integer("current_content_version").notNull().default(1),
    governingOperationId: uuid("governing_operation_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    updatedByMembershipId: uuid("updated_by_membership_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByMembershipId: uuid("archived_by_membership_id"),
    redactionRequestedAt: timestamp("redaction_requested_at", { withTimezone: true }),
    redactionRequestedByMembershipId: uuid("redaction_requested_by_membership_id"),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedByMembershipId: uuid("redacted_by_membership_id"),
    purgeRequestedAt: timestamp("purge_requested_at", { withTimezone: true }),
    purgeRequestedByMembershipId: uuid("purge_requested_by_membership_id"),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    purgedByMembershipId: uuid("purged_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("document_records_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("document_records_workspace_lifecycle_updated_idx").on(table.workspaceId, table.lifecycle, table.updatedAt.desc(), table.id.desc()),
    index("document_records_workspace_creator_lifecycle_updated_idx").on(table.workspaceId, table.createdByMembershipId, table.lifecycle, table.updatedAt.desc(), table.id.desc()),
    foreignKey({ name: "document_records_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_updater_fk", columns: [table.workspaceId, table.updatedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_archiver_fk", columns: [table.workspaceId, table.archivedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_redaction_requester_fk", columns: [table.workspaceId, table.redactionRequestedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_redactor_fk", columns: [table.workspaceId, table.redactedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_purge_requester_fk", columns: [table.workspaceId, table.purgeRequestedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "document_records_workspace_purger_fk", columns: [table.workspaceId, table.purgedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("document_records_lifecycle_check", sql`${table.lifecycle} in ('active','archived','redaction_pending','redacted','purge_pending','purged')`),
    check("document_records_availability_check", sql`${table.availability} in ('awaiting_upload','quarantined','available','blocked','failed','unavailable')`),
    check("document_records_version_check", sql`${table.version}>0 and ${table.currentContentVersion} between 1 and 100`),
    check("document_records_metadata_pairs_check", sql`num_nonnulls(${table.archivedAt},${table.archivedByMembershipId})<>1 and num_nonnulls(${table.redactionRequestedAt},${table.redactionRequestedByMembershipId})<>1 and num_nonnulls(${table.redactedAt},${table.redactedByMembershipId})<>1 and num_nonnulls(${table.purgeRequestedAt},${table.purgeRequestedByMembershipId})<>1 and num_nonnulls(${table.purgedAt},${table.purgedByMembershipId})<>1`),
    check("document_records_lifecycle_metadata_check", sql`
      (${table.lifecycle}='active' and num_nonnulls(${table.archivedAt},${table.archivedByMembershipId},${table.redactionRequestedAt},${table.redactionRequestedByMembershipId},${table.redactedAt},${table.redactedByMembershipId},${table.purgeRequestedAt},${table.purgeRequestedByMembershipId},${table.purgedAt},${table.purgedByMembershipId})=0) or
      (${table.lifecycle}='archived' and ${table.archivedAt} is not null and ${table.redactionRequestedAt} is null and ${table.redactedAt} is null and ${table.purgeRequestedAt} is null and ${table.purgedAt} is null) or
      (${table.lifecycle}='redaction_pending' and ${table.redactionRequestedAt} is not null and ${table.redactedAt} is null and ${table.purgeRequestedAt} is null and ${table.purgedAt} is null) or
      (${table.lifecycle}='redacted' and ${table.redactionRequestedAt} is not null and ${table.redactedAt} is not null and ${table.purgeRequestedAt} is null and ${table.purgedAt} is null) or
      (${table.lifecycle}='purge_pending' and ${table.purgeRequestedAt} is not null and ${table.purgedAt} is null and (${table.archivedAt} is not null or (${table.redactionRequestedAt} is not null and ${table.redactedAt} is not null))) or
      (${table.lifecycle}='purged' and ${table.purgeRequestedAt} is not null and ${table.purgedAt} is not null and (${table.archivedAt} is not null or (${table.redactionRequestedAt} is not null and ${table.redactedAt} is not null)))`),
    check("document_records_terminal_availability_check", sql`${table.lifecycle} not in ('redaction_pending','redacted','purge_pending','purged') or ${table.availability}='unavailable'`),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    contentVersion: integer("content_version").notNull(),
    state: text("state").notNull().default("reserved"),
    displayFilename: text("display_filename"),
    declaredMimeType: text("declared_mime_type"),
    detectedMimeType: text("detected_mime_type"),
    byteSize: bigint("byte_size", { mode: "number" }),
    sha256Hex: char("sha256_hex", { length: 64 }),
    redactionMarker: text("redaction_marker"),
    governingOperationId: uuid("governing_operation_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("document_versions_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("document_versions_workspace_document_content_uq").on(table.workspaceId, table.documentId, table.contentVersion),
    index("document_versions_workspace_document_content_idx").on(table.workspaceId, table.documentId, table.contentVersion.desc()),
    foreignKey({ name: "document_versions_document_fk", columns: [table.workspaceId, table.documentId], foreignColumns: [documentRecords.workspaceId, documentRecords.id] }),
    foreignKey({ name: "document_versions_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("document_versions_content_version_check", sql`${table.contentVersion} between 1 and 100`),
    check("document_versions_state_check", sql`${table.state} in ('reserved','uploaded','quarantined','available','blocked','failed','redacted','purged')`),
    check("document_versions_filename_check", sql`${table.displayFilename} is null or (char_length(btrim(${table.displayFilename})) between 1 and 255 and ${table.displayFilename} !~ '[[:cntrl:]/\\\\]')`),
    check("document_versions_declared_mime_check", sql`${table.declaredMimeType} is null or ${table.declaredMimeType} in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')`),
    check("document_versions_detected_mime_check", sql`${table.detectedMimeType} is null or ${table.detectedMimeType} in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')`),
    check("document_versions_size_check", sql`${table.byteSize} is null or ${table.byteSize} between 1 and 26214400`),
    check("document_versions_hash_check", sql`${table.sha256Hex} is null or ${table.sha256Hex} ~ '^[0-9a-f]{64}$'`),
    check("document_versions_state_metadata_check", sql`
      (${table.state}='reserved' and ${table.displayFilename} is not null and ${table.declaredMimeType} is not null and ${table.detectedMimeType} is null and ${table.byteSize} is null and ${table.sha256Hex} is null and ${table.availableAt} is null and ${table.redactedAt} is null and ${table.purgedAt} is null and ${table.redactionMarker} is null) or
      (${table.state} in ('uploaded','quarantined') and ${table.displayFilename} is not null and ${table.declaredMimeType} is not null and ${table.detectedMimeType} is not null and ${table.byteSize} is not null and ${table.sha256Hex} is not null and ${table.availableAt} is null and ${table.redactedAt} is null and ${table.purgedAt} is null and ${table.redactionMarker} is null) or
      (${table.state}='available' and ${table.displayFilename} is not null and ${table.declaredMimeType} is not null and ${table.detectedMimeType} is not null and ${table.byteSize} is not null and ${table.sha256Hex} is not null and ${table.availableAt} is not null and ${table.redactedAt} is null and ${table.purgedAt} is null and ${table.redactionMarker} is null) or
      (${table.state} in ('blocked','failed') and ${table.displayFilename} is not null and ${table.declaredMimeType} is not null and ${table.detectedMimeType} is not null and ${table.byteSize} is not null and ${table.sha256Hex} is not null and ${table.redactedAt} is null and ${table.purgedAt} is null and ${table.redactionMarker} is null) or
      (${table.state}='redacted' and ${table.displayFilename} is null and ${table.declaredMimeType} is null and ${table.detectedMimeType} is null and ${table.byteSize} is null and ${table.sha256Hex} is null and ${table.redactionMarker}='content_redacted' and ${table.redactedAt} is not null and ${table.purgedAt} is null) or
      (${table.state}='purged' and ${table.displayFilename} is null and ${table.declaredMimeType} is null and ${table.detectedMimeType} is null and ${table.byteSize} is null and ${table.sha256Hex} is null and ${table.redactionMarker}='content_redacted' and ${table.purgedAt} is not null)`),
  ],
);

export const documentRecordReferences = pgTable(
  "document_record_references",
  {
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    relationshipRole: text("relationship_role").notNull().default("related"),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "document_record_references_pk", columns: [table.workspaceId, table.documentId, table.recordType, table.recordId] }),
    index("document_record_references_target_idx").on(table.workspaceId, table.recordType, table.recordId, table.documentId),
    foreignKey({ name: "document_record_references_document_fk", columns: [table.workspaceId, table.documentId], foreignColumns: [documentRecords.workspaceId, documentRecords.id] }),
    foreignKey({ name: "document_record_references_workspace_creator_fk", columns: [table.workspaceId, table.createdByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("document_record_references_type_check", sql`${table.recordType} in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')`),
    check("document_record_references_role_check", sql`${table.relationshipRole}='related'`),
  ],
);

export const documentStorageObjects = pgTable(
  "document_storage_objects",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    contentVersion: integer("content_version").notNull(),
    storageAdapterCode: text("storage_adapter_code").notNull(),
    residencyRegionCode: text("residency_region_code").notNull(),
    residencyPolicyVersion: text("residency_policy_version").notNull(),
    containerHandle: text("container_handle").notNull(),
    objectKey: text("object_key").notNull(),
    providerObjectVersion: text("provider_object_version"),
    etag: text("etag"),
    encryptionMode: text("encryption_mode").notNull(),
    encryptionKeyHandle: text("encryption_key_handle"),
    state: text("state").notNull().default("reserved"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    uploadVerifiedAt: timestamp("upload_verified_at", { withTimezone: true }),
    deleteRequestedAt: timestamp("delete_requested_at", { withTimezone: true }),
    deleteVerifiedAt: timestamp("delete_verified_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    governingOperationId: uuid("governing_operation_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("document_storage_objects_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("document_storage_objects_workspace_document_content_uq").on(table.workspaceId, table.documentId, table.contentVersion),
    uniqueIndex("document_storage_objects_locator_uq").on(table.storageAdapterCode, table.residencyRegionCode, table.containerHandle, table.objectKey),
    index("document_storage_objects_worker_idx").on(table.state, table.nextAttemptAt, table.id),
    index("document_storage_objects_workspace_state_updated_idx").on(table.workspaceId, table.state, table.updatedAt, table.id),
    foreignKey({ name: "document_storage_objects_version_fk", columns: [table.workspaceId, table.documentId, table.contentVersion], foreignColumns: [documentVersions.workspaceId, documentVersions.documentId, documentVersions.contentVersion] }),
    check("document_storage_objects_adapter_check", sql`${table.storageAdapterCode} ~ '^[a-z][a-z0-9_.-]{1,63}$' and ${table.residencyRegionCode} ~ '^[a-z][a-z0-9_.-]{1,63}$'`),
    check("document_storage_objects_policy_check", sql`char_length(btrim(${table.residencyPolicyVersion})) between 1 and 64`),
    check("document_storage_objects_container_check", sql`char_length(btrim(${table.containerHandle})) between 1 and 200 and ${table.containerHandle} !~ '[[:cntrl:]]'`),
    check("document_storage_objects_key_check", sql`char_length(btrim(${table.objectKey})) between 1 and 512 and ${table.objectKey} !~ '[[:cntrl:]]' and ${table.objectKey} !~ '^/' and ${table.objectKey} !~ '(^|/)\\.{1,2}(/|$)'`),
    check("document_storage_objects_provider_facts_check", sql`(${table.providerObjectVersion} is null or (char_length(btrim(${table.providerObjectVersion})) between 1 and 256 and ${table.providerObjectVersion} !~ '[[:cntrl:]]')) and (${table.etag} is null or (char_length(btrim(${table.etag})) between 1 and 256 and ${table.etag} !~ '[[:cntrl:]]'))`),
    check("document_storage_objects_encryption_check", sql`${table.encryptionMode} in ('provider_managed','customer_managed_envelope') and ((${table.state}<>'purged' and ${table.encryptionMode}='provider_managed' and ${table.encryptionKeyHandle} is null) or (${table.state}<>'purged' and ${table.encryptionMode}='customer_managed_envelope' and char_length(btrim(${table.encryptionKeyHandle})) between 1 and 256 and ${table.encryptionKeyHandle} !~ '[[:cntrl:]]') or (${table.state}='purged' and ${table.encryptionKeyHandle} is null))`),
    check("document_storage_objects_state_check", sql`${table.state} in ('reserved','uploaded','quarantined','scanning','clean','blocked','failed','delete_pending','purged')`),
    check("document_storage_objects_attempt_check", sql`${table.attemptCount} between 0 and 3`),
    check("document_storage_objects_state_metadata_check", sql`
      (${table.state}='reserved' and ${table.uploadVerifiedAt} is null and ${table.deleteRequestedAt} is null and ${table.deleteVerifiedAt} is null) or
      (${table.state} in ('uploaded','quarantined','scanning','clean','blocked','failed') and ${table.uploadVerifiedAt} is not null and ${table.deleteRequestedAt} is null and ${table.deleteVerifiedAt} is null) or
      (${table.state}='delete_pending' and ${table.deleteRequestedAt} is not null and ${table.deleteVerifiedAt} is null) or
      (${table.state}='purged' and ${table.deleteRequestedAt} is not null and ${table.deleteVerifiedAt} is not null and ${table.providerObjectVersion} is null and ${table.etag} is null)`),
    check("document_storage_objects_retry_check", sql`${table.nextAttemptAt} is null or ${table.state} in ('quarantined','scanning','failed')`),
  ],
);

export const documentScanResults = pgTable(
  "document_scan_results",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    storageObjectId: uuid("storage_object_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: text("outcome").notNull(),
    engineCode: text("engine_code").notNull(),
    engineVersion: text("engine_version").notNull(),
    signatureSetVersion: text("signature_set_version").notNull(),
    scannedSha256Hex: char("scanned_sha256_hex", { length: 64 }).notNull(),
    safeResultCode: text("safe_result_code").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    governingOperationId: uuid("governing_operation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_scan_results_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("document_scan_results_workspace_object_attempt_uq").on(table.workspaceId, table.storageObjectId, table.attemptNumber),
    index("document_scan_results_workspace_object_attempt_idx").on(table.workspaceId, table.storageObjectId, table.attemptNumber.desc()),
    foreignKey({ name: "document_scan_results_object_fk", columns: [table.workspaceId, table.storageObjectId], foreignColumns: [documentStorageObjects.workspaceId, documentStorageObjects.id] }),
    check("document_scan_results_attempt_check", sql`${table.attemptNumber} between 1 and 3`),
    check("document_scan_results_outcome_check", sql`${table.outcome} in ('clean','infected','error','timeout')`),
    check("document_scan_results_codes_check", sql`char_length(btrim(${table.engineCode})) between 1 and 128 and ${table.engineCode} !~ '[[:cntrl:]]' and char_length(btrim(${table.engineVersion})) between 1 and 128 and ${table.engineVersion} !~ '[[:cntrl:]]' and char_length(btrim(${table.signatureSetVersion})) between 1 and 128 and ${table.signatureSetVersion} !~ '[[:cntrl:]]' and char_length(btrim(${table.safeResultCode})) between 1 and 128 and ${table.safeResultCode} !~ '[[:cntrl:]]'`),
    check("document_scan_results_hash_check", sql`${table.scannedSha256Hex} ~ '^[0-9a-f]{64}$'`),
    check("document_scan_results_time_check", sql`${table.completedAt}>=${table.startedAt}`),
  ],
);

export const retentionLegalHolds = pgTable(
  "retention_legal_holds",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "no action" }),
    recordType: text("record_type").notNull().default("crm.document"),
    recordId: uuid("record_id").notNull(),
    status: text("status").notNull().default("active"),
    reasonCode: text("reason_code").notNull(),
    caseReference: text("case_reference"),
    policyVersion: text("policy_version").notNull(),
    version: integer("version").notNull().default(1),
    governingOperationId: uuid("governing_operation_id").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
    placedByMembershipId: uuid("placed_by_membership_id").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedByMembershipId: uuid("released_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("retention_legal_holds_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("retention_legal_holds_active_record_uq").on(table.workspaceId, table.recordType, table.recordId).where(sql`${table.status}='active'`),
    index("retention_legal_holds_record_idx").on(table.workspaceId, table.recordType, table.recordId, table.status, table.id),
    index("retention_legal_holds_workspace_status_updated_idx").on(table.workspaceId, table.status, table.updatedAt, table.id),
    foreignKey({ name: "retention_legal_holds_workspace_placer_fk", columns: [table.workspaceId, table.placedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    foreignKey({ name: "retention_legal_holds_workspace_releaser_fk", columns: [table.workspaceId, table.releasedByMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("retention_legal_holds_record_type_check", sql`${table.recordType}='crm.document'`),
    check("retention_legal_holds_status_check", sql`${table.status} in ('active','released')`),
    check("retention_legal_holds_reason_check", sql`${table.reasonCode} in ('legal_dispute','regulatory','investigation','customer_request','other')`),
    check("retention_legal_holds_case_check", sql`${table.caseReference} is null or (char_length(btrim(${table.caseReference})) between 1 and 200 and ${table.caseReference} !~ '[[:cntrl:]]')`),
    check("retention_legal_holds_policy_check", sql`char_length(btrim(${table.policyVersion})) between 1 and 64`),
    check("retention_legal_holds_version_check", sql`${table.version}>0`),
    check("retention_legal_holds_release_check", sql`(${table.status}='active' and ${table.releasedAt} is null and ${table.releasedByMembershipId} is null) or (${table.status}='released' and ${table.releasedAt} is not null and ${table.releasedByMembershipId} is not null)`),
  ],
);

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: id(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    selectedPlanCode: text("selected_plan_code"),
    billingCadence: text("billing_cadence"),
    currentStep: text("current_step").notNull().default("account"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("onboarding_billing_cadence_check", sql`${table.billingCadence} is null or ${table.billingCadence} in ('monthly', 'annual', 'sales_managed')`),
    check("onboarding_current_step_check", sql`${table.currentStep} in ('account', 'identity_verification', 'workspace', 'complete')`),
    check("onboarding_version_check", sql`${table.version} > 0`),
  ],
);

export const planCatalogEntries = pgTable(
  "plan_catalog_entries",
  {
    id: id(),
    code: text("code").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    allowedCadences: jsonb("allowed_cadences").notNull(),
    includedActiveSeats: integer("included_active_seats").notNull(),
    currencyCode: text("currency_code"),
    billingUnit: text("billing_unit"),
    monthlyPriceCents: integer("monthly_price_cents"),
    annualMonthlyEquivalentPriceCents: integer("annual_monthly_equivalent_price_cents"),
    featureFlags: jsonb("feature_flags").notNull(),
    trialDays: integer("trial_days").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("plan_catalog_code_version_uq").on(table.code, table.catalogVersion),
    check("plan_catalog_status_check", sql`${table.status} in ('draft', 'active', 'retired')`),
    check("plan_catalog_seats_check", sql`${table.includedActiveSeats} > 0`),
    check("plan_catalog_trial_days_check", sql`${table.trialDays} >= 0`),
    check(
      "plan_catalog_pricing_tuple_check",
      sql`num_nonnulls(
        ${table.currencyCode},
        ${table.billingUnit},
        ${table.monthlyPriceCents},
        ${table.annualMonthlyEquivalentPriceCents}
      ) = 0 or (
        num_nonnulls(
          ${table.currencyCode},
          ${table.billingUnit},
          ${table.monthlyPriceCents},
          ${table.annualMonthlyEquivalentPriceCents}
        ) = 4
        and
        ${table.currencyCode} ~ '^[A-Z]{3}$'
        and ${table.billingUnit} = 'workspace_subscription'
        and ${table.monthlyPriceCents} > 0
        and ${table.annualMonthlyEquivalentPriceCents} > 0
      )`,
    ),
    check("plan_catalog_effective_dates_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
    check(
      "plan_catalog_allowed_cadences_check",
      sql`jsonb_typeof(${table.allowedCadences}) = 'array' and ${table.allowedCadences} <@ '["monthly", "annual", "sales_managed"]'::jsonb`,
    ),
  ],
);

export const workspaceEntitlementSnapshots = pgTable(
  "workspace_entitlement_snapshots",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    planCode: text("plan_code").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    effectiveFeatureFlags: jsonb("effective_feature_flags").notNull(),
    effectiveLimits: jsonb("effective_limits").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("entitlement_workspace_idx").on(table.workspaceId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activeWorkspaceId: uuid("active_workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    sessionHash: text("session_hash").notNull().unique(),
    securityVersion: integer("security_version").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).defaultNow().notNull(),
    authMethod: text("auth_method").notNull().default("legacy"),
    ...timestamps,
  },
  (table) => [
    index("sessions_user_active_idx").on(table.userId, table.revokedAt, table.lastSeenAt),
    check("sessions_auth_method_check", sql`${table.authMethod} in ('password', 'google', 'fixture', 'legacy')`),
  ],
);

export const identityTokens = pgTable(
  "identity_tokens",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("identity_tokens_user_purpose_idx").on(table.userId, table.purpose),
    check("identity_tokens_purpose_check", sql`${table.purpose} in ('email_verification', 'password_reset')`),
    check("identity_tokens_terminal_state_check", sql`${table.consumedAt} is null or ${table.replacedAt} is null`),
  ],
);

export const oidcTransactions = pgTable("oidc_transactions", {
  id: id(),
  stateHash: text("state_hash").notNull().unique(),
  nonceHash: text("nonce_hash").notNull(),
  pkceVerifierHash: text("pkce_verifier_hash").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  linkingUserId: uuid("linking_user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ...timestamps,
});

export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    id: id(),
    action: text("action").notNull(),
    riskKeyHash: text("risk_key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rate_limit_action_key_window_uq").on(table.action, table.riskKeyHash, table.windowStartedAt),
    check("rate_limit_action_check", sql`${table.action} in ('register', 'login', 'verify', 'verification_resend', 'reset_request', 'reset_complete', 'invite_create', 'invite_resend', 'invite_accept', 'invite_revoke', 'member_change', 'team_change', 'recent_auth')`),
    check("rate_limit_attempts_check", sql`${table.attempts} > 0`),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: id(),
    principalKey: text("principal_key").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    outcome: jsonb("outcome").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("idempotency_principal_operation_key_uq").on(table.principalKey, table.operation, table.idempotencyKey)],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    operationId: uuid("operation_id"),
    resultVersion: integer("result_version"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    providerIdempotencyKey: text("provider_idempotency_key").unique(),
    leaseOwner: text("lease_owner"),
    leaseGeneration: integer("lease_generation").notNull().default(0),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    index("outbox_pending_idx").on(table.status, table.availableAt),
    index("outbox_workspace_idx").on(table.workspaceId),
    uniqueIndex("outbox_operation_event_uq").on(table.workspaceId, table.topic, table.aggregateType, table.aggregateId, table.operationId, table.resultVersion).where(sql`${table.workspaceId} is not null and ${table.aggregateId} is not null and ${table.operationId} is not null and ${table.resultVersion} is not null`),
    check("outbox_status_check", sql`${table.status} in ('pending', 'processing', 'retry', 'delivered', 'dead_letter')`),
    check("outbox_attempts_check", sql`${table.attempts} >= 0`),
    check("outbox_lease_generation_check", sql`${table.leaseGeneration} >= 0`),
    check("outbox_result_version_check", sql`${table.resultVersion} is null or ${table.resultVersion}>0`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorMembershipId: uuid("actor_membership_id"),
    actorType: text("actor_type").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    outcome: text("outcome").notNull(),
    reasonCode: text("reason_code"),
    requestId: text("request_id"),
    correlationId: text("correlation_id"),
    sourceIp: text("source_ip"),
    sourceIpPolicy: text("source_ip_policy").notNull().default("omitted"),
    userAgentSanitized: text("user_agent_sanitized"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadataVersion: integer("metadata_version").notNull().default(1),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    foreignKey({
      name: "audit_actor_workspace_membership_fk",
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id],
    }),
    check("audit_actor_type_check", sql`${table.actorType} in ('user', 'system', 'support')`),
    check("audit_outcome_check", sql`${table.outcome} in ('success', 'denied', 'failure')`),
    check("audit_actor_membership_scope_check", sql`${table.actorMembershipId} is null or ${table.workspaceId} is not null`),
    check("audit_source_ip_policy_check", sql`${table.sourceIpPolicy} in ('omitted', 'truncated', 'hashed')`),
    check("audit_source_ip_presence_check", sql`(${table.sourceIpPolicy} = 'omitted' and ${table.sourceIp} is null) or (${table.sourceIpPolicy} <> 'omitted' and ${table.sourceIp} is not null)`),
    check("audit_user_agent_sanitized_check", sql`${table.userAgentSanitized} is null or (length(${table.userAgentSanitized}) <= 512 and ${table.userAgentSanitized} !~ '[[:cntrl:]]')`),
    check("audit_before_safe_shape_check", sql`${table.before} is null or jsonb_typeof(${table.before}) in ('object', 'array')`),
    check("audit_after_safe_shape_check", sql`${table.after} is null or jsonb_typeof(${table.after}) in ('object', 'array')`),
    check("audit_metadata_version_check", sql`${table.metadataVersion} > 0`),
    check(
      "audit_metadata_allowlist_check",
      sql`jsonb_typeof(${table.metadata}) = 'object' and (${table.metadata} - array['risk_bucket', 'change_fields', 'provider', 'auth_method', 'policy_version', 'operation', 'invitation_generation', 'assigned_role', 'team_count', 'expected_version', 'result_version', 'seat_limit', 'active_seats', 'auth_age_bucket', 'selection_version']::text[]) = '{}'::jsonb`,
    ),
  ],
);
