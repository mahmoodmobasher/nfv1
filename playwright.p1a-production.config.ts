import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "p1a-frontend-journeys.spec.ts",
  workers: 1,
  retries: 0,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:3011" },
  webServer: {
    command: [
      "NODE_ENV=development",
      "DATABASE_URL=postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
      "SESSION_COOKIE_NAME=nexaflow_session",
      "SESSION_SECRET=local-only-session-secret-change-me-32chars",
      "EMAIL_PROVIDER=smtp-local",
      "SMTP_HOST=127.0.0.1",
      "SMTP_PORT=1025",
      "APP_ORIGIN=http://127.0.0.1:3011",
      "SESSION_IDLE_MINUTES=30",
      "SESSION_ABSOLUTE_HOURS=24",
      "SESSION_TOUCH_INTERVAL_SECONDS=60",
      "TRUSTED_PROXY_ENABLED=false",
      "OIDC_FIXTURE_SECRET=local-oidc-fixture-secret-32-characters",
      "OIDC_MODE=fixture",
      "OIDC_REDIRECT_URIS=http://127.0.0.1:3011/api/auth/oidc/callback,http://127.0.0.1:3011/api/auth/recent/oidc/callback",
      "npm run start -- --hostname 127.0.0.1 --port 3011",
    ].join(" "),
    url: "http://127.0.0.1:3011",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
