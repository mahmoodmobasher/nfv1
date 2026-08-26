import { describe, expect, it } from "vitest";
import {
  salesDealBoardQueryV1Schema,
  salesDealCreateCommandV1Schema,
  salesDealListViewV1Schema,
  salesDealResultV1Schema,
  salesPipelineViewV1Schema,
} from "../src/backend/modules/sales";
import {
  salesFailure,
  salesJson,
} from "../src/backend/modules/sales/presentation/deal.http";
import { parseStageCursors } from "../src/backend/modules/sales/presentation/deal-query";

const id = () => crypto.randomUUID();

describe("DEALS-01 strict transport", () => {
  it("keeps money exact and assignment/party cardinality unambiguous", () => {
    const valid = {
      contractVersion: "sales-deal-create.v1",
      pipelineId: id(),
      stageId: id(),
      name: "Renewal",
      value: {
        amountMinor: "90071992547409919999",
        currencyCode: "CAD",
        currencyExponent: 2,
      },
      expectedCloseOn: null,
      parties: {
        companyId: id(),
        contacts: [{ contactId: id(), isPrimary: true }],
      },
      responsibleMembershipId: id(),
      responsibleTeamId: null,
      visibility: "workspace",
      visibleTeamIds: [],
    };
    expect(salesDealCreateCommandV1Schema.parse(valid).value?.amountMinor).toBe(
      "90071992547409919999",
    );
    expect(
      salesDealCreateCommandV1Schema.safeParse({
        ...valid,
        value: { amountMinor: 42, currencyCode: "CAD", currencyExponent: 2 },
      }).success,
    ).toBe(false);
    expect(
      salesDealCreateCommandV1Schema.safeParse({
        ...valid,
        visibility: "teams",
        visibleTeamIds: [],
      }).success,
    ).toBe(false);
  });

  it("freezes repeated stageCursor GET encoding and rejects ambiguous entries", () => {
    const first = id(),
      second = id();
    const params = new URLSearchParams();
    params.append("stageCursor", `${first}.opaque-one`);
    params.append("stageCursor", `${second}.opaque-two`);
    expect(parseStageCursors(params)).toEqual({
      [first]: "opaque-one",
      [second]: "opaque-two",
    });
    params.append("stageCursor", `${first}.replacement`);
    expect(() => parseStageCursors(params)).toThrow();
    expect(
      salesDealBoardQueryV1Schema.safeParse({
        stageCursors: Object.fromEntries(
          Array.from({ length: 101 }, () => [id(), "opaque"]),
        ),
      }).success,
    ).toBe(false);
  });

  it("freezes PII-free create authority and durable no-effect results", () => {
    const requestId = id(),
      pipelineId = id(),
      stageId = id();
    expect(
      salesPipelineViewV1Schema.parse({
        contractVersion: "sales-pipeline-view.v1",
        pipeline: null,
        options: { responsibleMemberships: [], teams: [] },
        capabilities: { canCreate: false, canManageAssignment: false },
        requestId,
      }),
    ).toMatchObject({ capabilities: { canCreate: false } });
    expect(
      salesDealResultV1Schema.parse({
        contractVersion: "sales-deal-result.v1",
        dealId: id(),
        version: 3,
        changed: false,
        replayed: false,
        stage: { stageId, outcomeClass: "open" },
        requestId,
        reconciliation: { required: false, action: "none" },
      }),
    ).toMatchObject({ changed: false, version: 3 });
    expect(
      salesDealListViewV1Schema.safeParse({
        contractVersion: "sales-deal-list.v1",
        filters: { lifecycle: "active", pipelineId },
        items: [],
        nextCursor: null,
        requestId,
        canCreate: true,
      }).success,
    ).toBe(false);
  });

  it("applies private no-store and stable minimized failures", async () => {
    const response = salesJson({ contractVersion: "sales-pipeline-view.v1" });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("cookie");
    const failed = salesFailure(
      Object.assign(new Error("secret@example.test"), {
        code: "party_unavailable",
        status: 409,
      }),
      id(),
    );
    expect(await failed.text()).not.toContain("secret@example.test");
  });
});
