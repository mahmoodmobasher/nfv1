import { describe, expect, it, vi } from "vitest";
import { GET as live } from "../src/app/api/health/live/route";
import { databaseIsReady, expectedMigrationState } from "../src/server/db/readiness";

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
});
