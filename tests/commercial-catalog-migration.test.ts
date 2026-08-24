import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync(new URL("../src/server/db/migrations/0012_commercial_catalog_authority.sql",import.meta.url),"utf8");

describe("commercial catalog migration boundary",()=>{
  it("pins the exact Product-authorized typed catalog values",()=>{
    expect(sql).toContain("2026-08-commercial-v1");
    expect(sql).toContain("'Essentials', 'active', '[\"monthly\",\"annual\"]', 1, 'USD', 'workspace_subscription', 6999, 2400");
    expect(sql).toContain("'Growth', 'active', '[\"monthly\",\"annual\"]', 5, 'USD', 'workspace_subscription', 8999, 5700");
    expect(sql).toContain("'Scale', 'active', '[\"monthly\",\"annual\"]', 15, 'USD', 'workspace_subscription', 11999, 10700");
    expect(sql).toContain('"allowed_cadences" = \'["monthly","annual"]\'::jsonb');
    expect(sql).toContain('"feature_flags" = \'{"crm":true,"automation":true,"advanced_roles":true}\'::jsonb');
    expect(sql).toContain('"trial_days" = 14');
    expect(sql).toContain('"effective_from" = \'2026-08-24T00:00:00Z\'::timestamptz AND "effective_to" IS NULL');
  });
  it("preserves historical catalog rows and every existing entitlement snapshot",()=>{
    expect(sql).not.toMatch(/delete\s+from\s+"plan_catalog_entries"/i);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+"workspace_entitlement_snapshots"/i);
  });
});
