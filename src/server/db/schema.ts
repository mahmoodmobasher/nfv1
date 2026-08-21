import { sql } from "drizzle-orm";
import {
  boolean,
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

export const leads = pgTable(
  "leads",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    emailDisplay: text("email_display").notNull(),
    company: text("company").notNull(),
    phone: text("phone"),
    source: text("source").notNull(),
    status: text("status").notNull().default("open"),
    stageId: uuid("stage_id").notNull(),
    ownerMembershipId: uuid("owner_membership_id").notNull(),
    visibility: text("visibility").notNull().default("workspace"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leads_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("leads_workspace_updated_idx").on(table.workspaceId, table.updatedAt, table.id),
    index("leads_workspace_email_idx").on(table.workspaceId, table.emailNormalized),
    foreignKey({ name: "leads_workspace_stage_fk", columns: [table.workspaceId, table.stageId], foreignColumns: [pipelineStages.workspaceId, pipelineStages.id] }),
    foreignKey({ name: "leads_workspace_owner_fk", columns: [table.workspaceId, table.ownerMembershipId], foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.id] }),
    check("leads_name_check", sql`length(btrim(${table.firstName})) between 1 and 100 and length(btrim(${table.lastName})) between 1 and 100`),
    check("leads_email_check", sql`length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized}=lower(btrim(${table.emailNormalized}))`),
    check("leads_company_check", sql`length(btrim(${table.company})) between 1 and 160`),
    check("leads_source_check", sql`${table.source} in ('website', 'referral', 'event', 'partner', 'other')`),
    check("leads_status_check", sql`${table.status} in ('open', 'won', 'lost')`),
    check("leads_visibility_check", sql`${table.visibility} in ('workspace', 'teams')`),
    check("leads_version_check", sql`${table.version} > 0`),
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

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionHash: text("session_hash").notNull().unique(),
  securityVersion: integer("security_version").notNull().default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).defaultNow().notNull(),
  authMethod: text("auth_method").notNull().default("legacy"),
  ...timestamps,
}, (table) => [check("sessions_auth_method_check", sql`${table.authMethod} in ('password', 'google', 'fixture', 'legacy')`)]);

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
    check("outbox_status_check", sql`${table.status} in ('pending', 'processing', 'retry', 'delivered', 'dead_letter')`),
    check("outbox_attempts_check", sql`${table.attempts} >= 0`),
    check("outbox_lease_generation_check", sql`${table.leaseGeneration} >= 0`),
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
      sql`jsonb_typeof(${table.metadata}) = 'object' and (${table.metadata} - array['risk_bucket', 'change_fields', 'provider', 'auth_method', 'policy_version', 'operation', 'invitation_generation', 'assigned_role', 'team_count', 'expected_version', 'result_version', 'seat_limit', 'active_seats', 'auth_age_bucket']::text[]) = '{}'::jsonb`,
    ),
  ],
);
