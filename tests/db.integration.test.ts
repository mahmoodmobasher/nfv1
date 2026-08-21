import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type AppDatabase } from "../src/server/db/client";
import { listWorkspaceMemberships } from "../src/server/db/repositories/workspace-memberships";

const integration = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@localhost:54329/nexaflow";

let db: AppDatabase;
let pool: Pool;

async function insertUser(email = `${randomUUID()}@example.test`) {
  const result = await pool.query<{ id: string }>(
    `insert into users (primary_email_normalized, primary_email_display, display_name)
     values ($1, $1, 'Integration User') returning id`,
    [email],
  );
  return result.rows[0].id;
}

async function insertWorkspace(createdByUserId: string, suffix = randomUUID()) {
  const result = await pool.query<{ id: string }>(
    `insert into workspaces (name, slug, plan_code, billing_cadence, created_by_user_id)
     values ('Integration Workspace', $1, 'starter', 'monthly', $2) returning id`,
    [`integration-${suffix}`, createdByUserId],
  );
  return result.rows[0].id;
}

async function insertRole(workspaceId: string, code = "member") {
  const result = await pool.query<{ id: string }>(
    `insert into roles (workspace_id, code) values ($1, $2) returning id`,
    [workspaceId, code],
  );
  return result.rows[0].id;
}

integration("PostgreSQL tenant and uniqueness constraints", () => {
  beforeAll(() => {
    ({ db, pool } = createDb({ connectionString }));
  });

  beforeEach(async () => {
    await pool.query("truncate table users, plan_catalog_entries, idempotency_records, outbox_messages, audit_events cascade");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("enforces normalized user email uniqueness", async () => {
    await insertUser("owner@example.test");
    await expect(insertUser("owner@example.test")).rejects.toMatchObject({ code: "23505" });
  });

  it("allows only one membership per workspace and user", async () => {
    const userId = await insertUser();
    const workspaceId = await insertWorkspace(userId);
    const roleId = await insertRole(workspaceId);
    await pool.query(
      "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3)",
      [workspaceId, userId, roleId],
    );
    await expect(
      pool.query(
        "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3)",
        [workspaceId, userId, roleId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects a role belonging to another workspace", async () => {
    const userId = await insertUser();
    const firstWorkspaceId = await insertWorkspace(userId);
    const secondWorkspaceId = await insertWorkspace(userId);
    const firstWorkspaceRoleId = await insertRole(firstWorkspaceId);
    await expect(
      pool.query(
        "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3)",
        [secondWorkspaceId, userId, firstWorkspaceRoleId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces idempotency uniqueness by principal, operation, and key", async () => {
    const values = ["user:1", "workspace.create", "request-1", "hash", new Date(Date.now() + 60_000)];
    const statement = `insert into idempotency_records
      (principal_key, operation, idempotency_key, request_hash, outcome, expires_at)
      values ($1, $2, $3, $4, '{}', $5)`;
    await pool.query(statement, values);
    await expect(pool.query(statement, values)).rejects.toMatchObject({ code: "23505" });
  });

  it("requires context and returns memberships only for its workspace", async () => {
    const firstUserId = await insertUser();
    const secondUserId = await insertUser();
    const firstWorkspaceId = await insertWorkspace(firstUserId);
    const secondWorkspaceId = await insertWorkspace(secondUserId);
    const firstRoleId = await insertRole(firstWorkspaceId);
    const secondRoleId = await insertRole(secondWorkspaceId);
    const firstMembership = await pool.query<{ id: string }>(
      "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3) returning id",
      [firstWorkspaceId, firstUserId, firstRoleId],
    );
    await pool.query(
      "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3)",
      [secondWorkspaceId, secondUserId, secondRoleId],
    );

    expect(() => listWorkspaceMemberships(db, null)).toThrow("workspace_context_required");
    const memberships = await listWorkspaceMemberships(db, {
      userId: firstUserId,
      workspaceId: firstWorkspaceId,
      membershipId: firstMembership.rows[0].id,
      role: "owner",
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(firstWorkspaceId);
  });

  it("retains explicit workspace scope on tenant-associated outbox messages", async () => {
    const userId = await insertUser();
    const workspaceId = await insertWorkspace(userId);
    const result = await pool.query<{ workspace_id: string }>(
      `insert into outbox_messages (workspace_id, topic, aggregate_type, aggregate_id, payload)
       values ($1, 'workspace.invitation', 'workspace', $1, '{}') returning workspace_id`,
      [workspaceId],
    );
    expect(result.rows[0].workspace_id).toBe(workspaceId);
    await expect(
      pool.query(
        "insert into outbox_messages (workspace_id, topic, aggregate_type, payload) values ($1, 'workspace.invitation', 'workspace', '{}')",
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it.each([
    ["identity provider", "insert into identity_credentials (user_id, provider, provider_subject) values ($1, 'saml', 'subject')"],
    ["user status", "update users set status = 'unknown' where id = $1"],
  ])("rejects an invalid %s", async (_label, statement) => {
    const userId = await insertUser();
    await expect(pool.query(statement, [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it.each([
    ["workspace status", "update workspaces set status = 'unknown' where id = $1"],
    ["billing cadence", "update workspaces set billing_cadence = 'weekly' where id = $1"],
  ])("rejects an invalid %s", async (_label, statement) => {
    const userId = await insertUser();
    const workspaceId = await insertWorkspace(userId);
    await expect(pool.query(statement, [workspaceId])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects invalid role and membership states", async () => {
    const userId = await insertUser();
    const workspaceId = await insertWorkspace(userId);
    await expect(insertRole(workspaceId, "billing_admin")).rejects.toMatchObject({ code: "23514" });
    const roleId = await insertRole(workspaceId);
    await expect(
      pool.query(
        "insert into workspace_memberships (workspace_id, user_id, role_id, status) values ($1, $2, $3, 'invited')",
        [workspaceId, userId, roleId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects invalid onboarding cadence and step values", async () => {
    const userId = await insertUser();
    await expect(
      pool.query(
        "insert into onboarding_progress (user_id, billing_cadence, current_step) values ($1, 'weekly', 'account')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "insert into onboarding_progress (user_id, billing_cadence, current_step) values ($1, 'monthly', 'billing')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces outbox state and attempt constraints", async () => {
    await expect(
      pool.query(
        "insert into outbox_messages (topic, aggregate_type, payload, status) values ('identity.verify', 'user', '{}', 'unknown')",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "insert into outbox_messages (topic, aggregate_type, payload, attempts) values ('identity.verify', 'user', '{}', -1)",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces versioned and effective plan catalog entries", async () => {
    const valid = await pool.query<{ catalog_version: string }>(
      `insert into plan_catalog_entries
       (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from)
       values ('growth', '2026-08', 'Growth', 'active', '["monthly", "annual"]', 3, '{}', 14, now())
       returning catalog_version`,
    );
    expect(valid.rows[0].catalog_version).toBe("2026-08");
    const invalidPlanStatements = [
      `insert into plan_catalog_entries
       (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from)
       values ('bad-status', '1', 'Invalid', 'available', '["monthly"]', 1, '{}', 0, now())`,
      `insert into plan_catalog_entries
       (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from)
       values ('bad-cadence', '1', 'Invalid', 'active', '["weekly"]', 1, '{}', 0, now())`,
      `insert into plan_catalog_entries
       (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from)
       values ('bad-seats', '1', 'Invalid', 'active', '["monthly"]', 0, '{}', 0, now())`,
      `insert into plan_catalog_entries
       (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from)
       values ('bad-trial', '1', 'Invalid', 'active', '["monthly"]', 1, '{}', -1, now())`,
    ];
    for (const statement of invalidPlanStatements) {
      await expect(pool.query(statement)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      pool.query(
        `insert into plan_catalog_entries
         (code, catalog_version, name, status, allowed_cadences, included_active_seats, feature_flags, trial_days, effective_from, effective_to)
         values ('expired', '1', 'Expired', 'retired', '["monthly"]', 1, '{}', 0, now(), now() - interval '1 day')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores the complete safe audit foundation and rejects unsafe values", async () => {
    const userId = await insertUser();
    const workspaceId = await insertWorkspace(userId);
    const roleId = await insertRole(workspaceId);
    const membership = await pool.query<{ id: string }>(
      "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3) returning id",
      [workspaceId, userId, roleId],
    );
    const valid = await pool.query<{ actor_type: string; metadata_version: number }>(
      `insert into audit_events
       (workspace_id, actor_user_id, actor_membership_id, actor_type, action, target_type, target_id,
        outcome, request_id, correlation_id, source_ip, source_ip_policy, user_agent_sanitized,
        before, after, metadata_version, metadata)
       values ($1, $2, $3, 'user', 'membership.updated', 'membership', $3, 'success',
        'request-1', 'correlation-1', 'hash:value', 'hashed', 'Integration Browser',
        '{"change_fields":["role_id"]}', '{"change_fields":["role_id"]}', 1,
        '{"change_fields":["role_id"],"operation":"membership.update"}')
       returning actor_type, metadata_version`,
      [workspaceId, userId, membership.rows[0].id],
    );
    expect(valid.rows[0]).toEqual({ actor_type: "user", metadata_version: 1 });

    const invalidAuditStatements = [
      `insert into audit_events (actor_type, action, target_type, outcome) values ('robot', 'test', 'test', 'success')`,
      `insert into audit_events (actor_type, action, target_type, outcome) values ('system', 'test', 'test', 'maybe')`,
      `insert into audit_events (actor_type, action, target_type, outcome, source_ip_policy) values ('system', 'test', 'test', 'success', 'raw')`,
      `insert into audit_events (actor_type, action, target_type, outcome, source_ip_policy) values ('system', 'test', 'test', 'success', 'hashed')`,
      `insert into audit_events (actor_type, action, target_type, outcome, metadata) values ('system', 'test', 'test', 'success', '{"secret":"forbidden"}')`,
      `insert into audit_events (actor_type, action, target_type, outcome, metadata_version) values ('system', 'test', 'test', 'success', 0)`,
      `insert into audit_events (actor_type, action, target_type, outcome, before) values ('system', 'test', 'test', 'success', '"unsafe"')`,
    ];
    for (const statement of invalidAuditStatements) {
      await expect(pool.query(statement)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      pool.query(
        `insert into audit_events
         (actor_type, action, target_type, outcome, user_agent_sanitized)
         values ('system', 'test', 'test', 'success', $1)`,
        ["unsafe\nagent"],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an audit membership from another workspace", async () => {
    const userId = await insertUser();
    const firstWorkspaceId = await insertWorkspace(userId);
    const secondWorkspaceId = await insertWorkspace(userId);
    const roleId = await insertRole(firstWorkspaceId);
    const membership = await pool.query<{ id: string }>(
      "insert into workspace_memberships (workspace_id, user_id, role_id) values ($1, $2, $3) returning id",
      [firstWorkspaceId, userId, roleId],
    );
    await expect(
      pool.query(
        `insert into audit_events
         (workspace_id, actor_membership_id, actor_type, action, target_type, outcome)
         values ($1, $2, 'user', 'test', 'workspace', 'denied')`,
        [secondWorkspaceId, membership.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
