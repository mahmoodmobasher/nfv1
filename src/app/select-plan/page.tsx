import Link from "next/link";
import { Check } from "lucide-react";
import { activeCommercialCatalog, type CommercialPlan } from "@/server/commercial/catalog";
import { query, type Cadence, type PlanKey } from "../onboarding/logic";
import { WebsiteShell } from "../onboarding/website-shell";
import { PlanAction } from "./plan-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose one Workspace plan | NexaFlow" };

const currency = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

const descriptions: Record<PlanKey, string> = {
  essentials: "For a company getting its CRM foundation in place.",
  growth: "For a growing revenue team coordinating one pipeline.",
  scale: "For a larger company using advanced roles and automation.",
};

export default async function SelectPlan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let catalog: CommercialPlan[] = [], unavailable = false;
  try { catalog = await activeCommercialCatalog(); } catch { unavailable = true; }
  const requestedPlan = typeof params.plan === "string" && ["essentials","growth","scale"].includes(params.plan) ? params.plan as PlanKey : "growth";
  const requestedCadence: Cadence = params.cadence === "annual" ? "annual" : "monthly";
  const resume = params.resume === "workspace";
  const selectedPlan = catalog.find((plan) => plan.code === requestedPlan) ?? catalog[0];
  const cadence = selectedPlan?.allowedCadences.includes(requestedCadence) ? requestedCadence : selectedPlan?.allowedCadences[0] ?? "monthly";

  return <WebsiteShell action="login"><section className="pricing" aria-labelledby="plan-heading"><p className="eyebrow">One company Workspace</p><h1 id="plan-heading">Choose one Workspace plan for your company</h1><p className="lead">Each self-service subscription includes one company Workspace. Included active seats include the Owner. Billing is not connected.</p>{unavailable || !selectedPlan ? <div className="alert error" role="alert"><div><b>Plans are temporarily unavailable.</b><p>We couldn’t load the active plan catalog. No selection was saved. Try again or contact Sales for help.</p></div></div> : <><div className="cadence" role="radiogroup" aria-label="Billing cadence">{(["monthly", "annual"] as const).map((option) => <Link key={option} role="radio" aria-checked={cadence === option} className={cadence === option ? "active" : ""} href={`/select-plan?${query(selectedPlan.code, option, resume ? "&resume=workspace" : "")}`}>{option === "monthly" ? "Monthly" : "Annual"}{cadence === option ? " · Selected" : ""}</Link>)}</div><div className="plan-grid">{catalog.map((plan) => { const active = plan.code === selectedPlan.code, allowedCadence = plan.allowedCadences.includes(cadence) ? cadence : plan.allowedCadences[0], price = allowedCadence === "monthly" ? plan.monthlyCents : plan.annualMonthlyEquivalentCents; return <article className={`plan-card ${active ? "selected" : ""}`} aria-current={active ? "true" : undefined} key={plan.code}>{active && <span className="selected-label"><Check aria-hidden="true" /> Selected</span>}<h2>{plan.name}</h2><p>{descriptions[plan.code]}</p><p className="plan-price"><b>{currency(price)}</b><span>{allowedCadence === "monthly" ? " / month" : " / month equivalent, billed annually"}</span></p><p><b>{plan.seats} active {plan.seats === 1 ? "seat" : "seats"}:</b> Owner included.</p><ul><li><Check aria-hidden="true" /> One company Workspace subscription</li><li><Check aria-hidden="true" /> {plan.trialDays}-day trial at creation</li><li><Check aria-hidden="true" /> Owner included in active seats</li></ul><PlanAction plan={plan.code} cadence={allowedCadence} name={plan.name} resume={resume} /><p className="pricing-note">Billing and plan changes are not connected in this environment.</p></article>})}<article className="plan-card"><h2>Enterprise</h2><p>Multiple Workspaces and custom capacity are available through Contact Sales.</p><p className="plan-price"><b>Custom</b><span>Contact Sales</span></p><ul><li><Check aria-hidden="true" /> Explicitly provisioned capacity</li><li><Check aria-hidden="true" /> Custom commercial terms</li><li><Check aria-hidden="true" /> Guided rollout</li></ul><a className="secondary link-button" href="mailto:info@nexaflowsystems.com?subject=NexaFlow%20Enterprise">Contact Sales</a></article></div></>}</section></WebsiteShell>;
}
