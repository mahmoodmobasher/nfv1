import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { leadManagementErrorEnvelopeV1Schema, leadOperationalEditCommandV1Schema, leadOperationalEditResultV1Schema, leadOperationalEditViewV1Schema,
  leadStageTransitionCommandV1Schema, leadStageTransitionResultV1Schema } from "../src/backend/modules/leads";
import { leadManagementErrorEnvelopeSchema, leadOperationalEditCommandSchema, leadOperationalEditResultSchema, leadOperationalEditViewSchema,
  leadStageTransitionCommandSchema, leadStageTransitionResultSchema } from "../src/frontend/shared/contracts/p1a-transport";

function canonicalSchema(schema: ZodType): unknown {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  };
  return normalize(toJSONSchema(schema));
}

describe("P1A Lead management transport contract", () => {
  it("keeps every public management schema in exact backend/frontend parity", () => {
    for (const [frontend, backend] of [
      [leadOperationalEditCommandSchema, leadOperationalEditCommandV1Schema],
      [leadStageTransitionCommandSchema, leadStageTransitionCommandV1Schema],
      [leadOperationalEditViewSchema, leadOperationalEditViewV1Schema],
      [leadOperationalEditResultSchema, leadOperationalEditResultV1Schema],
      [leadStageTransitionResultSchema, leadStageTransitionResultV1Schema],
      [leadManagementErrorEnvelopeSchema, leadManagementErrorEnvelopeV1Schema],
    ] as const) expect(canonicalSchema(frontend)).toEqual(canonicalSchema(backend));
  });

  it("strictly rejects identity, stage-through-edit, lifecycle, attribution, and unknown fields", () => {
    const base = { contractVersion: "lead-operational-edit.v1", expectedVersion: 1,
      responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] };
    expect(leadOperationalEditCommandV1Schema.parse(base)).toEqual(base);
    for (const forbidden of ["displayName", "name", "email", "phone", "contactId", "companyId", "source", "receivedAt",
      "status", "lifecycle", "stageId", "identityReviewStatus"])
      expect(leadOperationalEditCommandV1Schema.safeParse({ ...base, [forbidden]: "forbidden" }).success, forbidden).toBe(false);
  });

  it("enforces explicit Team visibility invariants and distinct command identities", () => {
    const teamId = "10000000-0000-4000-8000-000000000001";
    const base = { contractVersion: "lead-operational-edit.v1", expectedVersion: 1,
      responsibleMembershipId: null, responsibleTeamId: teamId, visibility: "teams" };
    expect(leadOperationalEditCommandV1Schema.safeParse({ ...base, visibleTeamIds: [] }).success).toBe(false);
    expect(leadOperationalEditCommandV1Schema.safeParse({ ...base, visibleTeamIds: [teamId, teamId] }).success).toBe(false);
    expect(leadOperationalEditCommandV1Schema.safeParse({ ...base, visibleTeamIds: [teamId] }).success).toBe(true);
    expect(leadStageTransitionCommandV1Schema.safeParse({ contractVersion: "lead-stage-transition.v1", expectedVersion: 1,
      targetStageId: teamId }).success).toBe(true);
    expect(leadStageTransitionCommandV1Schema.safeParse({ ...base, visibleTeamIds: [teamId] }).success).toBe(false);
  });
});
