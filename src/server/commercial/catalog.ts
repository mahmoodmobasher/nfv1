import { createDb } from "../db/client";

export type CommercialPlan = { code: "essentials" | "growth" | "scale"; name: string; allowedCadences: ("monthly" | "annual")[]; seats: number; trialDays: number; monthlyCents: number; annualMonthlyEquivalentCents: number };
const expected = { essentials: ["Essentials", 1, 6999, 2400, { crm: true }], growth: ["Growth", 5, 8999, 5700, { crm: true, automation: true }], scale: ["Scale", 15, 11999, 10700, { crm: true, automation: true, advanced_roles: true }] } as const;

export async function activeCommercialCatalog(): Promise<CommercialPlan[]> {
  const { pool } = createDb();
  try {
    const { rows } = await pool.query(`select code,catalog_version,name,allowed_cadences,included_active_seats,trial_days,monthly_price_cents,annual_monthly_equivalent_price_cents,currency_code,billing_unit,feature_flags from plan_catalog_entries where status='active' and effective_from<=now() and (effective_to is null or effective_to>now()) order by code,effective_from desc,created_at desc,id desc`);
    if (rows.length !== 3) throw new Error("commercial_catalog_unavailable");
    return rows.map((row) => {
      const rule = expected[row.code as keyof typeof expected];
      if (!rule || row.catalog_version !== "2026-08-commercial-v1" || row.name !== rule[0] || row.currency_code !== "USD" || row.billing_unit !== "workspace_subscription" || row.included_active_seats !== rule[1] || row.monthly_price_cents !== rule[2] || row.annual_monthly_equivalent_price_cents !== rule[3] || row.trial_days !== 14 || JSON.stringify(row.feature_flags) !== JSON.stringify(rule[4]) || !Array.isArray(row.allowed_cadences) || row.allowed_cadences.length !== 2 || !row.allowed_cadences.includes("monthly") || !row.allowed_cadences.includes("annual")) throw new Error("commercial_catalog_unavailable");
      return { code: row.code, name: row.name, allowedCadences: row.allowed_cadences, seats: row.included_active_seats, trialDays: row.trial_days, monthlyCents: row.monthly_price_cents, annualMonthlyEquivalentCents: row.annual_monthly_equivalent_price_cents } as CommercialPlan;
    });
  } finally { await pool.end(); }
}
