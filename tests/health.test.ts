import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as live } from "../src/app/api/health/live/route";
import { GET as ready } from "../src/app/api/health/ready/route";
import { databaseIsReady, expectedMigrationState } from "../src/server/db/readiness";

afterEach(() => vi.unstubAllEnvs());

describe("bounded deployment health", () => {
  it("returns liveness without consulting dependencies", async () => {
    const response = await live();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "live" });
  });

  it("recognizes only the checked-in migration count and head", async () => {
    const expected = expectedMigrationState();
    const query = vi.fn().mockResolvedValue({ rows: [{ applied_count: String(expected.count), migration_head: String(expected.head) }] });
    expect(await databaseIsReady({ query } as never)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("fails closed for drift or unavailable PostgreSQL", async () => {
    const expected = expectedMigrationState();
    expect(await databaseIsReady({ query: vi.fn().mockResolvedValue({ rows: [{ applied_count: String(expected.count - 1), migration_head: String(expected.head) }] }) } as never)).toBe(false);
    expect(await databaseIsReady({ query: vi.fn().mockRejectedValue(new Error("offline")) } as never)).toBe(false);
  });

  it("reports not ready before database access when production email configuration is incomplete", async () => {
    const environment = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://app:placeholder@db.example.invalid/nexaflow",
      SESSION_COOKIE_NAME: "nexaflow_session",
      SESSION_SECRET: "production-session-secret-more-than-32-characters",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "",
      EMAIL_FROM: "NexaFlow accounts <accounts@mail.nexaflowsystems.com>",
      APP_ORIGIN: "https://app.nexaflowsystems.com",
      SESSION_IDLE_MINUTES: "30",
      SESSION_ABSOLUTE_HOURS: "24",
      SESSION_TOUCH_INTERVAL_SECONDS: "60",
      TRUSTED_PROXY_ENABLED: "false",
      OIDC_FIXTURE_SECRET: "production-fixture-secret-more-than-32-characters",
      OIDC_MODE: "disabled",
      OIDC_REDIRECT_URIS: "https://app.nexaflowsystems.com/api/auth/oidc/callback",
    };
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);

    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "not_ready" });
  });
});
