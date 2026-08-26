import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { salesDealBoardQueryV1Schema, salesDealBoardViewV1Schema, salesDealCreateCommandV1Schema, salesDealDetailViewV1Schema, salesDealLifecycleCommandV1Schema, salesDealListQueryV1Schema, salesDealListViewV1Schema, salesDealMoneyV1Schema, salesDealResultV1Schema, salesDealStageTransitionCommandV1Schema, salesDealUpdateCommandV1Schema, salesErrorEnvelopeV1Schema } from "@/frontend/features/deals";

function canonical(schema: ZodType): unknown { const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value; return normalize(toJSONSchema(schema)); }
const ids = { pipeline: "30000000-0000-4000-8000-000000000001", stage: "30000000-0000-4000-8000-000000000002", deal: "30000000-0000-4000-8000-000000000003", membership: "30000000-0000-4000-8000-000000000004", request: "30000000-0000-4000-8000-000000000005" };
const summary = { dealId: ids.deal, name: "Manual Deal", lifecycle: "active", outcomeClass: "open", stageId: ids.stage, pipelineId: ids.pipeline, value: { amountMinor: "0", currencyCode: "USD", currencyExponent: 2 }, expectedCloseOn: null, probabilityBps: 1000, company: { available: false }, primaryContact: null, responsibleMembershipId: ids.membership, version: 1, updatedAt: "2026-08-26T12:00:00.000Z", capabilities: { canEdit: true, canTransition: true, canArchive: true, canRestore: false } } as const;
const stage = { stageId: ids.stage, code: "sales.qualification", label: "Qualification", outcomeClass: "open", sortKey: 1, defaultProbabilityBps: 1000, version: 1 } as const;

describe("DEALS-01 frontend transport parity", () => {
  const live = "/Users/moemahmood/.codex/worktrees/77aa/Nexflow_v1/src/backend/modules/sales/contracts/deal.contract.ts", integrated = resolve("src/backend/modules/sales/contracts/deal.contract.ts"), backendContract = existsSync(integrated) ? integrated : existsSync(live) ? live : undefined;
  (backendContract ? it : it.skip)("mechanically matches every published backend schema", async () => {
    const backend = await import(/* @vite-ignore */ pathToFileURL(backendContract!).href), frontend = await import("@/frontend/features/deals/contracts/deal.contracts") as Record<string, unknown>;
    for (const name of ["salesDealCreateCommandV1Schema", "salesDealUpdateCommandV1Schema", "salesDealStageTransitionCommandV1Schema", "salesDealLifecycleCommandV1Schema", "salesDealListQueryV1Schema", "salesDealBoardQueryV1Schema", "salesPipelineViewV1Schema", "salesDealListViewV1Schema", "salesDealBoardViewV1Schema", "salesDealDetailViewV1Schema", "salesDealResultV1Schema", "salesErrorEnvelopeV1Schema"])
      expect(canonical(frontend[name] as ZodType), name).toEqual(canonical(backend[name] as ZodType));
  });
  it("keeps decimal money, commands, keysets, and strict bounds", () => {
    expect(salesDealMoneyV1Schema.safeParse(null).success).toBe(true);
    expect(salesDealMoneyV1Schema.safeParse({ amountMinor: "99999999999999999999", currencyCode: "CAD", currencyExponent: 2 }).success).toBe(true);
    expect(salesDealMoneyV1Schema.safeParse({ amountMinor: 1, currencyCode: "USD", currencyExponent: 2 }).success).toBe(false);
    expect(salesDealListQueryV1Schema.parse({})).toEqual({ lifecycle: "active", limit: 25 });
    expect(salesDealBoardQueryV1Schema.parse({})).toEqual({ limitPerStage: 10, stageCursors: {} });
    expect(salesDealBoardQueryV1Schema.safeParse({ stageCursors: { [ids.stage]: "opaque_cursor" } }).success).toBe(true);
    const assignment = { responsibleMembershipId: ids.membership, responsibleTeamId: null, visibility: "workspace" as const, visibleTeamIds: [] as string[] }, parties = { companyId: ids.deal, contacts: [] as Array<{ contactId: string; isPrimary: boolean }> };
    expect(salesDealCreateCommandV1Schema.safeParse({ contractVersion: "sales-deal-create.v1", pipelineId: ids.pipeline, stageId: ids.stage, name: "Manual Deal", value: null, expectedCloseOn: null, parties, ...assignment }).success).toBe(true);
    expect(salesDealUpdateCommandV1Schema.safeParse({ contractVersion: "sales-deal-update.v1", expectedVersion: 1, name: "Manual Deal", value: null, expectedCloseOn: null, parties, ...assignment }).success).toBe(true);
    expect(salesDealStageTransitionCommandV1Schema.safeParse({ contractVersion: "sales-deal-stage-transition.v1", expectedVersion: 1, targetStageId: ids.stage, lostReasonCode: "free_text" }).success).toBe(false);
    expect(salesDealLifecycleCommandV1Schema.safeParse({ contractVersion: "sales-deal-lifecycle.v1", expectedVersion: 1 }).success).toBe(true);
  });
  it("uses the same minimized summary in List and every ordered Board stage", () => {
    expect(salesDealListViewV1Schema.safeParse({ contractVersion: "sales-deal-list.v1", filters: { lifecycle: "active", pipelineId: ids.pipeline }, items: [summary], nextCursor: null, requestId: ids.request }).success).toBe(true);
    expect(salesDealBoardViewV1Schema.safeParse({ contractVersion: "sales-deal-board.v1", pipeline: { pipelineId: ids.pipeline, label: "Sales", configurationVersion: 1, version: 1 }, filters: { pipelineId: ids.pipeline }, stages: [{ ...stage, items: [summary], nextCursor: null }, { ...stage, stageId: ids.request, code: "sales.discovery", label: "Discovery", sortKey: 2, items: [], nextCursor: null }], requestId: ids.request }).success).toBe(true);
    expect(salesDealListViewV1Schema.safeParse({ contractVersion: "sales-deal-list.v1", filters: { lifecycle: "active" }, items: [{ ...summary, email: "private@example.test" }], nextCursor: null, requestId: ids.request }).success).toBe(false);
  });
  it("parses detail availability, results, and errors without disclosure drift", () => {
    const detail = { contractVersion: "sales-deal-detail.v1", deal: { dealId: summary.dealId, name: summary.name, lifecycle: summary.lifecycle, outcomeClass: summary.outcomeClass, stageId: summary.stageId, pipelineId: summary.pipelineId, value: null, probabilityBps: summary.probabilityBps, expectedCloseOn: summary.expectedCloseOn, closedAt: null, lostReasonCode: null, responsibleMembershipId: summary.responsibleMembershipId, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [], parties: [{ kind: "company", available: false }, { kind: "contact", available: false }], version: summary.version, updatedAt: summary.updatedAt, capabilities: { ...summary.capabilities, canManageAssignment: true, eligibleTargetStageIds: [ids.stage] } }, pipeline: { pipelineId: ids.pipeline, label: "Sales", stages: [stage] }, options: { responsibleMemberships: [], teams: [] }, requestId: ids.request };
    expect(salesDealDetailViewV1Schema.safeParse(detail).success).toBe(true);
    expect(salesDealDetailViewV1Schema.safeParse({ ...detail, deal: { ...detail.deal, parties: [{ kind: "contact", available: false, contactId: ids.deal }] } }).success).toBe(false);
    expect(salesDealResultV1Schema.safeParse({ contractVersion: "sales-deal-result.v1", dealId: ids.deal, version: 2, changed: false, replayed: true, stage: { stageId: ids.stage, outcomeClass: "open" }, requestId: ids.request, reconciliation: { required: false, action: "none" } }).success).toBe(true);
    expect(salesErrorEnvelopeV1Schema.safeParse({ error: { code: "stale_version", message: "Changed", retryable: false, reconciliation: { required: true, action: "refetch_deal" } }, requestId: ids.request }).success).toBe(true);
  });
});
