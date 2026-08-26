import type { SalesDealMoney } from "./deal.contracts";

export function formatDealMoney(value: SalesDealMoney): string {
  if (!value) return "Unknown";
  const padded = value.amountMinor.padStart(value.currencyExponent + 1, "0");
  const split = padded.length - value.currencyExponent;
  const major = padded.slice(0, split).replace(/^0+(?=\d)/, "");
  const minor = padded.slice(split);
  return `${value.currencyCode} ${major.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${minor}`;
}

export function parseDealMoney(value: string, currencyCode: "USD" | "CAD"): SalesDealMoney | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(0|[1-9][0-9]{0,17})(?:\.([0-9]{1,2}))?$/.exec(trimmed);
  if (!match) return "invalid";
  const amountMinor = `${match[1]}${(match[2] ?? "").padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  if (!/^(0|[1-9][0-9]{0,19})$/.test(amountMinor)) return "invalid";
  return { amountMinor, currencyCode, currencyExponent: 2 };
}
