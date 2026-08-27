import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CustomerGraphError } from "../src/backend/modules/customer-graph/contracts/customer-graph.contract";
import {
  moneyColumns,
  normalizeDomain,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  phoneCountry,
} from "../src/backend/modules/customer-graph/application/customer-graph.command-adapters";
import {
  decodeCustomerGraphCursor,
  encodeCustomerGraphCursor,
} from "../src/backend/modules/customer-graph/application/customer-graph.pagination";

describe("Customer Graph application modules", () => {
  it("keeps normalization and exact money adaptation deterministic", () => {
    expect(normalizeName("  Acme   North  ")).toBe("acme north");
    expect(normalizeDomain(" Example.COM ")).toBe("example.com");
    expect(normalizeEmail(" Person@Example.COM ")).toBe(
      "person@example.com",
    );
    expect(normalizePhone(" +14165550123 ")).toBe("+14165550123");
    expect(phoneCountry("+14165550123")).toBe("+141");
    expect(
      moneyColumns({
        amountMinor: "1250",
        currencyCode: "CAD",
        currencyExponent: 2,
      }),
    ).toEqual(["1250", "CAD", 2]);
    expect(moneyColumns(null)).toEqual([null, null, null]);
  });

  it("round-trips a kind/status-bound keyset cursor", () => {
    const row = {
      id: "10000000-0000-4000-8000-000000000001",
      updatedAt: "2026-08-27T12:00:00.000Z",
    };
    const encoded = encodeCustomerGraphCursor("company", "active", row);
    expect(decodeCustomerGraphCursor(encoded, "company", "active")).toEqual({
      v: 1,
      k: "company",
      s: "active",
      u: row.updatedAt,
      i: row.id,
    });
  });

  it("rejects cursor reuse across a different feed", () => {
    const encoded = encodeCustomerGraphCursor("company", "active", {
      id: "10000000-0000-4000-8000-000000000001",
      updatedAt: "2026-08-27T12:00:00.000Z",
    });
    expect(() =>
      decodeCustomerGraphCursor(encoded, "contact", "active"),
    ).toThrowError(CustomerGraphError);
    expect(() =>
      decodeCustomerGraphCursor(encoded, "company", "archived"),
    ).toThrowError(CustomerGraphError);
  });

  it("keeps adapters and pagination free of SQL and transaction ownership", () => {
    const adapters = readFileSync(
      "src/backend/modules/customer-graph/application/customer-graph.command-adapters.ts",
      "utf8",
    );
    const pagination = readFileSync(
      "src/backend/modules/customer-graph/application/customer-graph.pagination.ts",
      "utf8",
    );
    expect(`${adapters}\n${pagination}`).not.toMatch(
      /\.query\(|runModuleTransaction|PoolClient/,
    );
  });
});
