import { describe, expect, it } from "vitest";
import { formatDealMoney, parseDealMoney } from "@/frontend/features/deals";

describe("DEALS-01 exact money presentation", () => {
  it("distinguishes unknown, zero, currencies, and the maximum without number coercion", () => {
    expect(formatDealMoney(null)).toBe("Unknown");
    expect(formatDealMoney({ amountMinor: "0", currencyCode: "USD", currencyExponent: 2 })).toBe("USD 0.00");
    expect(formatDealMoney({ amountMinor: "1", currencyCode: "CAD", currencyExponent: 2 })).toBe("CAD 0.01");
    expect(formatDealMoney({ amountMinor: "99999999999999999999", currencyCode: "USD", currencyExponent: 2 })).toBe("USD 999,999,999,999,999,999.99");
  });
  it("parses major-unit drafts with string operations and rejects unsafe forms", () => {
    expect(parseDealMoney("", "USD")).toBeNull();
    expect(parseDealMoney("0", "CAD")).toEqual({ amountMinor: "0", currencyCode: "CAD", currencyExponent: 2 });
    expect(parseDealMoney("1234.5", "USD")).toEqual({ amountMinor: "123450", currencyCode: "USD", currencyExponent: 2 });
    expect(parseDealMoney("999999999999999999.99", "CAD")).toEqual({ amountMinor: "99999999999999999999", currencyCode: "CAD", currencyExponent: 2 });
    for (const value of ["-1", "1.234", "01", "1e3", "1000000000000000000.00"]) expect(parseDealMoney(value, "USD"), value).toBe("invalid");
  });
});
