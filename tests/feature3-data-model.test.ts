import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { identityCredentials, sessions, userPreferences } from "../src/server/db/schema";

describe("Feature 3 data model", () => {
  it("defines global, versioned preferences without Workspace authority", () => {
    expect(Object.keys(userPreferences)).toEqual(expect.arrayContaining(["userId", "appearance", "locale", "timeZone", "version", "createdAt", "updatedAt"]));
    expect(Object.keys(userPreferences)).not.toContain("workspaceId");
  });

  it("keeps credential and session lookup integrity in the migration", () => {
    const sql = readFileSync("src/server/db/migrations/0011_white_masque.sql", "utf8");
    expect(sql).toContain('CREATE TABLE "user_preferences"');
    expect(sql).toContain('"user_id" uuid PRIMARY KEY');
    expect(sql).toContain('ON DELETE cascade');
    expect(sql).toContain('"version" integer DEFAULT 1 NOT NULL');
    expect(sql).toContain('"user_preferences_appearance_check"');
    expect(sql).toContain('CREATE UNIQUE INDEX "identity_password_user_uq"');
    expect(sql).toContain('WHERE "identity_credentials"."provider" = \'password\'');
    expect(sql).toContain('CREATE INDEX "sessions_user_active_idx"');
    expect(Object.keys(identityCredentials)).toContain("userId");
    expect(Object.keys(sessions)).toContain("userId");
  });
});
