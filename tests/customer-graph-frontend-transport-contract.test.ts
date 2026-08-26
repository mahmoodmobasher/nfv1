import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { companyCreateCommandV1Schema, companyEditCommandV1Schema, companyLifecycleCommandV1Schema,
  contactAffiliationReplaceCommandV1Schema, contactCreateCommandV1Schema, contactEditCommandV1Schema,
  contactLifecycleCommandV1Schema, customerGraphDetailEnvelopeSchema, customerGraphErrorEnvelopeV1Schema,
  companyResultEnvelopeSchema, contactResultEnvelopeSchema, customerGraphListEnvelopeSchema, customerGraphListQueryV1Schema } from "@/frontend/features/customer-graph/contracts/customer-graph.contracts";

const ids = { record: "30000000-0000-4000-8000-000000000001", request: "30000000-0000-4000-8000-000000000002" };
const assignment = { responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace" as const, visibleTeamIds: [] as string[] };
const capabilities = { canEdit: false, canArchive: false, canRestore: false };
const list = { data: { contractVersion: "customer-graph-list.v1", kind: "contact", capabilities: { canCreate: false }, items: [{ id: ids.record, displayName: "Visible contact", status: "active", version: 1,
  updatedAt: "2026-08-26T12:00:00.000Z", capabilities, reconciliation: { required: true, action: "authority_adoption_required" } }], nextCursor: null, requestId: ids.request } } as const;
const detail = { data: { contractVersion: "customer-graph-detail.v1", kind: "contact", record: { id: ids.record, version: 1, status: "active", displayName: "Visible contact",
  updatedAt: "2026-08-26T12:00:00.000Z", ...assignment, authorityContractVersion: "legacy-p1a-root-v1", reconciliation: { required: true, action: "authority_adoption_required" },
  firstName: "Visible", lastName: "Contact", email: null, phone: null, maskedEmail: "v***@example.test", maskedPhone: "***0123", disclosure: { channels: "masked" },
  affiliations: [], capabilities: { ...capabilities, canManageAffiliations: false, canManageAssignment: false } }, options: { responsibleMemberships: [], teams: [] }, requestId: ids.request } } as const;

function canonical(schema: ZodType): unknown { const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value; return normalize(toJSONSchema(schema)); }

describe("CUSTOMER-GRAPH-01 frontend transport", () => {
  const integratedContract = resolve("src/backend/modules/customer-graph/contracts/customer-graph.contract.ts"),
    backendContract = existsSync(integratedContract) ? integratedContract : process.env.CUSTOMER_GRAPH_BACKEND_CONTRACT;
  (backendContract ? it : it.skip)("mechanically matches every final backend schema", async () => {
    const backend = await import(/* @vite-ignore */ pathToFileURL(backendContract!).href);
    const frontend = await import("@/frontend/features/customer-graph/contracts/customer-graph.contracts") as Record<string, unknown>;
    for (const name of ["companyCreateCommandV1Schema", "companyEditCommandV1Schema", "companyLifecycleCommandV1Schema", "contactCreateCommandV1Schema",
      "contactEditCommandV1Schema", "contactLifecycleCommandV1Schema", "contactAffiliationReplaceCommandV1Schema", "customerGraphListQueryV1Schema",
      "customerGraphListViewV1Schema", "customerGraphDetailViewV1Schema", "companyResultV1Schema", "contactResultV1Schema", "customerGraphErrorEnvelopeV1Schema"])
      expect(canonical(frontend[name] as ZodType), name).toEqual(canonical(backend[name] as ZodType));
  });
  it("mirrors strict command schemas and mutation invariants", () => {
    const commands = [
      [companyCreateCommandV1Schema, { contractVersion: "company-create.v1", displayName: "Northwind", domain: "northwind.test", ...assignment }],
      [companyEditCommandV1Schema, { contractVersion: "company-edit.v1", expectedVersion: 1, displayName: "Northwind", domain: null, ...assignment }],
      [companyLifecycleCommandV1Schema, { contractVersion: "company-lifecycle.v1", expectedVersion: 1 }],
      [contactCreateCommandV1Schema, { contractVersion: "contact-create.v1", firstName: "Avery", lastName: null, email: null, phone: "+14165550123", affiliation: null, ...assignment }],
      [contactEditCommandV1Schema, { contractVersion: "contact-edit.v1", expectedVersion: 1, firstName: "Avery", lastName: null, email: null, phone: null, ...assignment }],
      [contactLifecycleCommandV1Schema, { contractVersion: "contact-lifecycle.v1", expectedVersion: 1 }],
      [contactAffiliationReplaceCommandV1Schema, { contractVersion: "contact-affiliation-replace.v1", expectedVersion: 1, affiliation: { companyId: ids.record, roleCode: "technical" } }],
    ] as const;
    for (const [schema, value] of commands) { expect(schema.safeParse(value).success).toBe(true); expect(schema.safeParse({ ...value, guessed: true }).success).toBe(false); }
    expect(companyEditCommandV1Schema.safeParse({ contractVersion: "company-edit.v1", expectedVersion: 0, displayName: "N", domain: null, ...assignment }).success).toBe(false);
    expect(contactCreateCommandV1Schema.safeParse({ contractVersion: "contact-create.v1", firstName: "A", lastName: null, email: null, phone: "4165550123", affiliation: null, ...assignment }).success).toBe(false);
  });

  it("bounds status/keyset queries and list payloads to 50", () => {
    expect(customerGraphListQueryV1Schema.parse({})).toEqual({ status: "active", limit: 25, bootstrap: false });
    expect(customerGraphListQueryV1Schema.parse({ bootstrap: true })).toEqual({ status: "active", limit: 25, bootstrap: true });
    expect(customerGraphListQueryV1Schema.safeParse({ bootstrap: true, cursor: "opaque" }).success).toBe(false);
    expect(customerGraphListQueryV1Schema.safeParse({ bootstrap: "true" }).success).toBe(false);
    expect(customerGraphListQueryV1Schema.safeParse({ status: "active", limit: 51 }).success).toBe(false);
    expect(customerGraphListQueryV1Schema.safeParse({ status: "active", cursor: "x".repeat(1025), limit: 50 }).success).toBe(false);
    expect(customerGraphListEnvelopeSchema.safeParse(list).success).toBe(true);
    expect(customerGraphListEnvelopeSchema.safeParse({ data: { ...list.data, capabilities: { canCreate: true }, items: [], nextCursor: null } }).success).toBe(true);
    expect(customerGraphListEnvelopeSchema.safeParse({ data: { ...list.data, capabilities: {} } }).success).toBe(false);
    expect(customerGraphListEnvelopeSchema.safeParse({ data: { ...list.data, items: Array.from({ length: 51 }, () => list.data.items[0]) } }).success).toBe(false);
  });

  it("accepts only minimized, capability-bearing views and rejects raw/private drift", () => {
    expect(customerGraphDetailEnvelopeSchema.safeParse(detail).success).toBe(true);
    for (const key of ["emailNormalized", "phoneNormalized", "domainNormalized", "secret", "membershipLabel", "teamLabel"])
      expect(customerGraphDetailEnvelopeSchema.safeParse({ data: { ...detail.data, record: { ...detail.data.record, [key]: "private" } } }).success, key).toBe(false);
    expect(customerGraphListEnvelopeSchema.safeParse({ data: { ...list.data, items: [{ ...list.data.items[0], email: "raw@example.test" }] } }).success).toBe(false);
    expect(customerGraphDetailEnvelopeSchema.safeParse({ data: { ...detail.data, record: { ...detail.data.record, capabilities: { ...detail.data.record.capabilities, canEdit: true } } } }).success).toBe(true);
    const hiddenAffiliation = { ...detail, data: { ...detail.data, record: { ...detail.data.record, affiliations: [{ companyUnavailable: true }] } } };
    expect(customerGraphDetailEnvelopeSchema.safeParse(hiddenAffiliation).success).toBe(true);
    expect(customerGraphDetailEnvelopeSchema.safeParse({ ...hiddenAffiliation, data: { ...hiddenAffiliation.data, record: { ...hiddenAffiliation.data.record, affiliations: [{ companyUnavailable: true, companyId: ids.record }] } } }).success).toBe(false);
  });

  it("parses every stable error/reconciliation and result branch strictly", () => {
    const actions = ["none", "refetch_record", "refetch_options", "retry_same_request"] as const;
    for (const action of actions) expect(customerGraphErrorEnvelopeV1Schema.safeParse({ error: { code: "stale_version", message: "The record has changed.", retryable: false, reconciliation: { required: action !== "none", action } }, requestId: ids.request }).success).toBe(true);
    expect(companyResultEnvelopeSchema.safeParse({ data: { contractVersion: "company-result.v1", companyId: ids.record, version: 2, replayed: false, requestId: ids.request } }).success).toBe(true);
    expect(contactResultEnvelopeSchema.safeParse({ data: { contractVersion: "contact-result.v1", contactId: ids.record, version: 2, replayed: false, requestId: ids.request } }).success).toBe(true);
  });

  it("keeps canonical schema normalization deterministic for backend parity checks", () => {
    expect(canonical(companyCreateCommandV1Schema)).toEqual(canonical(companyCreateCommandV1Schema));
    expect(canonical(contactAffiliationReplaceCommandV1Schema)).not.toEqual(canonical(contactLifecycleCommandV1Schema));
  });
});
