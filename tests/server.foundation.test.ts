import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getServerEnv } from "../src/server/env";
import { requireWorkspaceContext } from "../src/server/authz/context";

describe("server foundation", () => {
  it("provides safe local-only environment defaults", () => { const env = getServerEnv({}); expect(env.DATABASE_URL).toContain("localhost"); expect(env.EMAIL_PROVIDER).toBe("smtp-local"); expect(env.SMTP_PORT).toBe(1025); expect(env.RESEND_API_KEY).toBeUndefined(); });
  it("does not provide development secrets in production", () => { expect(() => getServerEnv({ NODE_ENV: "production" })).toThrow(); });
  it("fails production email configuration closed unless Resend is complete", () => {
    const base={NODE_ENV:"production",DATABASE_URL:"postgres://app:x@db.example.invalid/app",SESSION_COOKIE_NAME:"s",SESSION_SECRET:"production-session-secret-more-than-32-characters",APP_ORIGIN:"https://app.nexaflowsystems.com",SESSION_IDLE_MINUTES:"30",SESSION_ABSOLUTE_HOURS:"24",SESSION_TOUCH_INTERVAL_SECONDS:"60",TRUSTED_PROXY_ENABLED:"false",OIDC_FIXTURE_SECRET:"production-fixture-secret-more-than-32-characters",OIDC_MODE:"disabled",OIDC_REDIRECT_URIS:"https://app.nexaflowsystems.com/api/auth/oidc/callback"};
    expect(()=>getServerEnv({...base,EMAIL_PROVIDER:"smtp-local",SMTP_HOST:"mailpit",SMTP_PORT:"1025"})).toThrow(/Production email delivery requires Resend/);
    expect(()=>getServerEnv({...base,EMAIL_PROVIDER:"resend",EMAIL_FROM:"NexaFlow accounts <accounts@mail.nexaflowsystems.com>"})).toThrow(/Resend mode requires/);
    expect(()=>getServerEnv({...base,EMAIL_PROVIDER:"resend",RESEND_API_KEY:"not-a-real-resend-credential",EMAIL_FROM:"accounts@unverified.example"})).toThrow(/verified mail\.nexaflowsystems\.com/);
    expect(()=>getServerEnv({...base,EMAIL_PROVIDER:"resend",RESEND_API_KEY:"not-a-real-resend-credential",EMAIL_FROM:"accounts@mail.nexaflowsystems.com>"})).toThrow(/verified mail\.nexaflowsystems\.com/);
    expect(getServerEnv({...base,EMAIL_PROVIDER:"resend",RESEND_API_KEY:"not-a-real-resend-credential",EMAIL_FROM:"NexaFlow accounts <accounts@mail.nexaflowsystems.com>"}).EMAIL_PROVIDER).toBe("resend");
  });
  it("requires complete workspace authorization context", () => { expect(() => requireWorkspaceContext(null)).toThrow("workspace_context_required"); expect(requireWorkspaceContext({ userId: "u", workspaceId: "w", membershipId: "m", role: "owner" }).workspaceId).toBe("w"); });
  it("checks in a workspace-scoped membership-to-role constraint", () => { const sql = readFileSync("src/server/db/migrations/0001_sleepy_bloodstorm.sql", "utf8"); expect(sql.indexOf("roles_workspace_id_id_uq")).toBeLessThan(sql.indexOf("membership_workspace_role_fk")); expect(sql).toContain('FOREIGN KEY ("workspace_id","role_id")'); });
});
