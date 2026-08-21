import { defineConfig } from "playwright/test";
export default defineConfig({ testDir: "./tests/e2e", expect: { timeout: 15_000 }, use: { baseURL: "http://127.0.0.1:3000" }, webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000 } });
