import Link from "next/link";
import { Check } from "lucide-react";
import { createDb } from "@/server/db/client";
import { query, type Cadence, type PlanKey, plans as presentationPlans } from "../onboarding/logic";
import { WebsiteShell } from "../onboarding/website-shell";
import { PlanAction } from "./plan-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose one Workspace plan | NexaFlow" };

type CatalogPlan = { code: PlanKey; name: string; allowed_cadences: Cadence[]; included_active_seats: number; trial_days: number };

async function activeCatalog(): Promise<CatalogPlan[]> {
  const { pool } = createDb();
  try {
    const result = await pool.query<CatalogPlan>(`select distinct on (code) code,name,allowed_cadences,included_active_seats,trial_days from plan_catalog_entries where status='active' and effective_from<=now() and (effective_to is null or effective_to>now()) order by code,effective_from desc`);
    return result.rows.filter((plan) => plan.code in presentationPlans);
  } finally { await pool.end(); }
}

const descriptions: Record<PlanKey, string> = {
  essentials: "For a company getting its CRM foundation in place.",
  growth: "For a growing revenue team coordinating one pipeline.",
  scale: "For a larger company using advanced roles and automation.",
};

export default async function SelectPlan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let catalog: CatalogPlan[] = [], unavailable = false;
  try { catalog = await activeCatalog(); } catch { unavailable = true; }
  const requestedPlan = typeof params.plan === "string" && params.plan in presentationPlans ? params.plan as PlanKey : "growth";
  const requestedCadence: Cadence = params.cadence === "annual" ? "annual" : "monthly";
  const resume = params.resume === "workspace";
  const selectedPlan = catalog.find((plan) => plan.code === requestedPlan) ?? catalog[0];
  const cadence = selectedPlan?.allowed_cadences.includes(requestedCadence) ? requestedCadence : selectedPlan?.allowed_cadences[0] ?? "monthly";

  return <WebsiteShell action="login"><section className="pricing" aria-labelledby="plan-heading"><p className="eyebrow">One company Workspace</p><h1 id="plan-heading">Choose one Workspace plan for your company</h1><p className="lead">Each self-service subscription includes one company Workspace. Included seats are total active seats and include the Owner.</p>{unavailable || !selectedPlan ? <div className="alert error" role="alert"><div><b>Plans are temporarily unavailable.</b><p>We couldn’t load the active plan catalog. No selection was saved. Try again or contact Sales for help.</p></div></div> : <><div className="cadence" role="radiogroup" aria-label="Billing cadence">{(["monthly", "annual"] as const).map((option) => <Link key={option} role="radio" aria-checked={cadence === option} className={cadence === option ? "active" : ""} href={`/select-plan?${query(selectedPlan.code, option, resume ? "&resume=workspace" : "")}`}>{option === "monthly" ? "Monthly" : "Annual"}{cadence === option ? " · Selected" : ""}</Link>)}</div><div className="plan-grid">{catalog.map((plan) => { const active = plan.code === selectedPlan.code, allowedCadence = plan.allowed_cadences.includes(cadence) ? cadence : plan.allowed_cadences[0], price = presentationPlans[plan.code][allowedCadence], additionalSeats = Math.max(0, plan.included_active_seats - 1); return <article className={`plan-card ${active ? "selected" : ""}`} aria-current={active ? "true" : undefined} key={plan.code}>{active && <span className="selected-label"><Check aria-hidden="true" /> Selected</span>}<h2>{plan.name}</h2><p>{descriptions[plan.code]}</p><p className="plan-price"><b>${price}</b><span>/ user / month</span></p><p><b>{plan.included_active_seats} {plan.included_active_seats === 1 ? "seat" : "seats"} total:</b> 1 Owner{additionalSeats ? ` + up to ${additionalSeats} Admins or Members` : "; the Owner uses the included seat"}.</p><ul><li><Check aria-hidden="true" /> One company Workspace</li><li><Check aria-hidden="true" /> {plan.trial_days}-day trial at creation</li><li><Check aria-hidden="true" /> Owner included in active seats</li></ul><PlanAction plan={plan.code} cadence={allowedCadence} name={plan.name} resume={resume} /><p className="pricing-note">No payment is collected in this environment. Production billing and plan changes are not connected.</p></article>})}<article className="plan-card"><h2>Enterprise</h2><p>Need multiple Workspaces or custom capacity? Contact Sales for an Enterprise deployment.</p><p className="plan-price"><b>Custom</b><span>Contact Sales</span></p><ul><li><Check aria-hidden="true" /> Explicitly provisioned capacity</li><li><Check aria-hidden="true" /> Custom commercial terms</li><li><Check aria-hidden="true" /> Guided rollout</li></ul><a className="secondary link-button" href="mailto:info@nexaflowsystems.com?subject=NexaFlow%20Enterprise">Contact Sales</a></article></div></>}</section></WebsiteShell>;
}
