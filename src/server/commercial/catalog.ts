import type { Pool, PoolClient } from "pg";
import { createDb } from "../db/client";

const catalogVersion = "2026-08-commercial-v1";
const planCodes = ["essentials", "growth", "scale"] as const;
type PlanCode = (typeof planCodes)[number];
type Cadence = "monthly" | "annual";

export type CommercialPlan = { code: PlanCode; name: string; allowedCadences: Cadence[]; seats: number; trialDays: number; monthlyCents: number; annualMonthlyEquivalentCents: number; catalogVersion: typeof catalogVersion; featureFlags: Record<string, true> };
const expected: Record<PlanCode, Omit<CommercialPlan, "code" | "allowedCadences" | "trialDays" | "catalogVersion">> = {
  essentials: { name: "Essentials", seats: 1, monthlyCents: 6999, annualMonthlyEquivalentCents: 2400, featureFlags: { crm: true } },
  growth: { name: "Growth", seats: 5, monthlyCents: 8999, annualMonthlyEquivalentCents: 5700, featureFlags: { crm: true, automation: true } },
  scale: { name: "Scale", seats: 15, monthlyCents: 11999, annualMonthlyEquivalentCents: 10700, featureFlags: { crm: true, automation: true, advanced_roles: true } },
};
const unavailable = () => new Error("commercial_catalog_unavailable");
const exactFlags = (actual: unknown, required: Record<string, true>) => {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const record = actual as Record<string, unknown>, actualKeys = Object.keys(record).sort(), requiredKeys = Object.keys(required).sort();
  return actualKeys.length === requiredKeys.length && actualKeys.every((key, index) => key === requiredKeys[index] && record[key] === true);
};

export function validateCommercialCatalog(rows: Record<string, unknown>[]): CommercialPlan[] {
  if (rows.length !== planCodes.length) throw unavailable();
  const validated = new Map<PlanCode, CommercialPlan>();
  for (const row of rows) {
    const code = row.code as PlanCode, rule = expected[code];
    if (!rule || validated.has(code) || row.catalog_version !== catalogVersion || row.name !== rule.name || row.currency_code !== "USD" || row.billing_unit !== "workspace_subscription" || row.included_active_seats !== rule.seats || row.monthly_price_cents !== rule.monthlyCents || row.annual_monthly_equivalent_price_cents !== rule.annualMonthlyEquivalentCents || row.trial_days !== 14 || !exactFlags(row.feature_flags, rule.featureFlags) || !Array.isArray(row.allowed_cadences) || row.allowed_cadences.length !== 2 || row.allowed_cadences[0] !== "monthly" || row.allowed_cadences[1] !== "annual") throw unavailable();
    validated.set(code, { code, name: rule.name, allowedCadences: ["monthly", "annual"], seats: rule.seats, trialDays: 14, monthlyCents: rule.monthlyCents, annualMonthlyEquivalentCents: rule.annualMonthlyEquivalentCents, catalogVersion, featureFlags: rule.featureFlags });
  }
  if (validated.size !== planCodes.length) throw unavailable();
  return planCodes.map((code) => validated.get(code)!);
}

export async function resolveActiveCommercialCatalog(database: Pool | PoolClient): Promise<CommercialPlan[]> {
  const { rows } = await database.query<Record<string, unknown>>(`select code,catalog_version,name,allowed_cadences,included_active_seats,trial_days,monthly_price_cents,annual_monthly_equivalent_price_cents,currency_code,billing_unit,feature_flags from plan_catalog_entries where status='active' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc,created_at desc,id desc`);
  return validateCommercialCatalog(rows);
}

export async function resolveSelectedCommercialPlan(database: Pool | PoolClient, code: unknown, cadence: unknown): Promise<CommercialPlan> {
  const catalog = await resolveActiveCommercialCatalog(database);
  const plan = catalog.find((item) => item.code === code && (cadence === "monthly" || cadence === "annual") && item.allowedCadences.includes(cadence));
  if (!plan) throw unavailable();
  return plan;
}

export async function activeCommercialCatalog(): Promise<CommercialPlan[]> {
  const { pool } = createDb();
  try { return await resolveActiveCommercialCatalog(pool); }
  finally { await pool.end(); }
}
