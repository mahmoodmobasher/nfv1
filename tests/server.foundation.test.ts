import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getServerEnv } from "../src/server/env";
import { requireWorkspaceContext } from "../src/server/authz/context";

describe("server foundation", () => {
  it("provides safe local-only environment defaults", () => { const env = getServerEnv({}); expect(env.DATABASE_URL).toContain("localhost"); expect(env.SMTP_PORT).toBe(1025); });
  it("does not provide development secrets in production", () => { expect(() => getServerEnv({ NODE_ENV: "production" })).toThrow(); });
  it("requires complete workspace authorization context", () => { expect(() => requireWorkspaceContext(null)).toThrow("workspace_context_required"); expect(requireWorkspaceContext({ userId: "u", workspaceId: "w", membershipId: "m", role: "owner" }).workspaceId).toBe("w"); });
  it("checks in a workspace-scoped membership-to-role constraint", () => { const sql = readFileSync("src/server/db/migrations/0001_sleepy_bloodstorm.sql", "utf8"); expect(sql.indexOf("roles_workspace_id_id_uq")).toBeLessThan(sql.indexOf("membership_workspace_role_fk")); expect(sql).toContain('FOREIGN KEY ("workspace_id","role_id")'); });
});
