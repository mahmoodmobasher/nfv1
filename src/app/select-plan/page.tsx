import Link from "next/link";
import { Check } from "lucide-react";
import {
  activeCommercialCatalog,
  type CommercialPlan,
} from "@/server/commercial/catalog";
import { query, type Cadence, type PlanKey } from "../onboarding/logic";
import { WebsiteShell } from "../onboarding/website-shell";
import { PlanAction } from "./plan-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose one Workspace plan | NexaFlow" };

const currency = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

const descriptions: Record<PlanKey, string> = {
  essentials: "For a company getting its CRM foundation in place.",
  growth: "For a growing revenue team coordinating one pipeline.",
  scale: "For a larger company using advanced roles and automation.",
};

export default async function SelectPlan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let catalog: CommercialPlan[] = [],
    unavailable = false;
  try {
    catalog = await activeCommercialCatalog();
  } catch {
    unavailable = true;
  }
  const requestedPlan =
    typeof params.plan === "string" &&
    ["essentials", "growth", "scale"].includes(params.plan)
      ? (params.plan as PlanKey)
      : "growth";
  const requestedCadence: Cadence =
    params.cadence === "annual" ? "annual" : "monthly";
  const resume = params.resume === "workspace";
  const selectedPlan =
    catalog.find((plan) => plan.code === requestedPlan) ?? catalog[0];
  const cadence = selectedPlan?.allowedCadences.includes(requestedCadence)
    ? requestedCadence
    : (selectedPlan?.allowedCadences[0] ?? "monthly");

  return (
    <WebsiteShell action="login">
      <section className="mx-auto max-w-6xl px-5 py-10" aria-labelledby="plan-heading">
        <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
          One company Workspace
        </p>
        <h1 id="plan-heading">Choose one Workspace plan for your company</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
          Each self-service subscription includes one company Workspace.
          Included active seats include the Owner. Billing is not connected.
        </p>
        {unavailable || !selectedPlan ? (
          <div className="mt-6 rounded-control border border-danger bg-danger-soft p-4 text-sm text-danger" role="alert">
            <div>
              <b>Plans are temporarily unavailable.</b>
              <p>
                We couldn’t load the active plan catalog. No selection was
                saved. Try again or contact Sales for help.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              className="mt-6 inline-flex rounded-control border border-control bg-surface-muted p-1"
              role="radiogroup"
              aria-label="Billing cadence"
            >
              {(["monthly", "annual"] as const).map((option) => (
                <Link
                  key={option}
                  role="radio"
                  aria-checked={cadence === option}
                  className={`rounded-control px-4 py-2 text-sm font-semibold ${cadence === option ? "bg-accent text-on-accent" : "text-ink-muted hover:bg-surface"}`}
                  href={`/select-plan?${query(selectedPlan.code, option, resume ? "&resume=workspace" : "")}`}
                >
                  {option === "monthly" ? "Monthly" : "Annual"}
                  {cadence === option ? " · Selected" : ""}
                </Link>
              ))}
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {catalog.map((plan) => {
                const active = plan.code === selectedPlan.code,
                  allowedCadence = plan.allowedCadences.includes(cadence)
                    ? cadence
                    : plan.allowedCadences[0],
                  price =
                    allowedCadence === "monthly"
                      ? plan.monthlyCents
                      : plan.annualMonthlyEquivalentCents;
                return (
                  <article
                    className={`relative grid gap-4 rounded-panel border bg-surface p-5 text-sm text-ink-muted [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:flex [&_li]:gap-2 [&_li_svg]:size-4 [&_li_svg]:text-success ${active ? "border-accent ring-1 ring-accent" : "border-line"}`}
                    aria-current={active ? "true" : undefined}
                    key={plan.code}
                  >
                    {active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink [&_svg]:size-3.5">
                        <Check aria-hidden="true" /> Selected
                      </span>
                    )}
                    <h2>{plan.name}</h2>
                    <p>{descriptions[plan.code]}</p>
                    <p className="plan-price">
                      <b>{currency(price)}</b>
                      <span>
                        {allowedCadence === "monthly"
                          ? " / month"
                          : " / month equivalent, billed annually"}
                      </span>
                    </p>
                    <p>
                      <b>
                        {plan.seats} active{" "}
                        {plan.seats === 1 ? "seat" : "seats"}:
                      </b>{" "}
                      Owner included.
                    </p>
                    <ul>
                      <li>
                        <Check aria-hidden="true" /> One company Workspace
                        subscription
                      </li>
                      <li>
                        <Check aria-hidden="true" /> {plan.trialDays}-day trial
                        at creation
                      </li>
                      <li>
                        <Check aria-hidden="true" /> Owner included in active
                        seats
                      </li>
                    </ul>
                    <PlanAction
                      plan={plan.code}
                      cadence={allowedCadence}
                      name={plan.name}
                      resume={resume}
                    />
                    <p className="mt-auto text-xs leading-5 text-ink-faint">
                      Billing and plan changes are not connected in this
                      environment.
                    </p>
                  </article>
                );
              })}
              <article className="grid gap-4 rounded-panel border border-line bg-surface p-5 text-sm text-ink-muted [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:flex [&_li]:gap-2 [&_li_svg]:size-4 [&_li_svg]:text-success">
                <h2>Enterprise</h2>
                <p>
                  Multiple Workspaces and custom capacity are available through
                  Contact Sales.
                </p>
                <p className="plan-price">
                  <b>Custom</b>
                  <span>Contact Sales</span>
                </p>
                <ul>
                  <li>
                    <Check aria-hidden="true" /> Explicitly provisioned capacity
                  </li>
                  <li>
                    <Check aria-hidden="true" /> Custom commercial terms
                  </li>
                  <li>
                    <Check aria-hidden="true" /> Guided rollout
                  </li>
                </ul>
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                  href="mailto:info@nexaflowsystems.com?subject=NexaFlow%20Enterprise"
                >
                  Contact Sales
                </a>
              </article>
            </div>
          </>
        )}
      </section>
    </WebsiteShell>
  );
}
