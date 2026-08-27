import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITY_FUTURE_SKEW_MS, activityCreateCommandV1Schema, activityListQueryV1Schema }
  from "../src/backend/modules/activities";

describe("ACTIVITY-01A contracts and module boundaries", () => {
  it("keeps the donor-adapted manual catalog strict and documents five-minute skew", () => {
    const valid = { contractVersion: "activity-create.v1", expectedLeadVersion: 1, kind: "email",
      occurredAt: new Date().toISOString(), subject: "Record-only email evidence" };
    expect(activityCreateCommandV1Schema.parse(valid)).toMatchObject({ direction: null, outcome: null,
      durationMinutes: null, details: null });
    expect(activityCreateCommandV1Schema.safeParse({ ...valid, deliveryProvider: "smtp" }).success).toBe(false);
    expect(activityCreateCommandV1Schema.safeParse({ ...valid, kind: "task" }).success).toBe(false);
    expect(activityListQueryV1Schema.safeParse({ queryVersion: "activity-list-query.v1", limit: 51 }).success).toBe(false);
    expect(ACTIVITY_FUTURE_SKEW_MS).toBe(300_000);
    expect(readFileSync("src/backend/modules/activities/README.md", "utf8")).toContain("never sends a message");
  });

  it("keeps feature logic modular and route imports on the public entry", () => {
    const files = readdirSync("src/backend/modules/activities/application").sort();
    expect(files).toEqual(expect.arrayContaining(["activity.shared.ts", "create-lead-activity.command.ts",
      "list-lead-activities.query.ts"]));
    const route = readFileSync("src/app/api/workspaces/[workspaceId]/leads/[leadId]/activities/route.ts", "utf8");
    expect(route).toContain('from "@/backend/modules/activities"');
    expect(route).not.toMatch(/persistence|activity_records|lead_activities|@\/server\/db/);
    const platform = ["src/backend/platform/audit/activity-evidence.ts", "src/backend/platform/outbox/activity-event.ts"]
      .map(path => readFileSync(path, "utf8")).join("\n");
    expect(platform).not.toMatch(/subject|details|lead_activities/);
  });
});
