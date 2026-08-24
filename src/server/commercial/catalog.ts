import { createDb } from "../db/client";

export type CommercialPlan = { code: "essentials" | "growth" | "scale"; name: string; allowedCadences: ("monthly" | "annual")[]; seats: number; trialDays: number; monthlyCents: number; annualMonthlyEquivalentCents: number };
const expected = { essentials: [1, 6999, 2400], growth: [5, 8999, 5700], scale: [15, 11999, 10700] } as const;

export async function activeCommercialCatalog(): Promise<CommercialPlan[]> {
  const { pool } = createDb();
  try {
    const { rows } = await pool.query(`select distinct on (code) code,name,allowed_cadences,included_active_seats,trial_days,monthly_price_cents,annual_monthly_equivalent_price_cents,currency_code,billing_unit from plan_catalog_entries where status='active' and effective_from<=now() and (effective_to is null or effective_to>now()) order by code,effective_from desc,created_at desc,id desc`);
    if (rows.length !== 3) throw new Error("commercial_catalog_unavailable");
    return rows.map((row) => {
      const rule = expected[row.code as keyof typeof expected];
      if (!rule || row.currency_code !== "USD" || row.billing_unit !== "workspace_subscription" || row.included_active_seats !== rule[0] || row.monthly_price_cents !== rule[1] || row.annual_monthly_equivalent_price_cents !== rule[2] || !Array.isArray(row.allowed_cadences)) throw new Error("commercial_catalog_unavailable");
      return { code: row.code, name: row.name, allowedCadences: row.allowed_cadences, seats: row.included_active_seats, trialDays: row.trial_days, monthlyCents: row.monthly_price_cents, annualMonthlyEquivalentCents: row.annual_monthly_equivalent_price_cents } as CommercialPlan;
    });
  } finally { await pool.end(); }
}
