import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = ["/", "/select-plan", "/register", "/verify-email", "/login", "/forgot-password", "/reset-password", "/workspace/create", "/workspace/ready", "/workspace/switch", "/crm", "/crm/home", "/crm/pipeline", "/invite", "/workspace/settings", "/workspace/settings/people", "/workspace/settings/invite", "/workspace/settings/invitations", "/workspace/settings/teams", "/workspace/settings/transfer-ownership", "/workspace/invitations/accept", "/crm/leads/new"];
const apiRoutes = ["/api/health/live", "/api/health/ready", "/api/workspaces/selectable", "/api/workspaces/switch"];

describe("Next.js route smoke coverage", () => {
  it("keeps every preview route backed by a page", () => {
    for (const route of routes) {
      const page = route === "/" ? "src/app/page.tsx" : `src/app${route}/page.tsx`;
      expect(existsSync(page), page).toBe(true);
    }
    for (const route of apiRoutes) {
      const handler = `src/app${route}/route.ts`;
      expect(existsSync(handler), handler).toBe(true);
    }
  });
});
