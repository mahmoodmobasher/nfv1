import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  Database,
  Handshake,
  Inbox,
  Layers3,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { activeCommercialCatalog } from "@/server/commercial/catalog";
import { activeSeatCopy } from "./marketing-seat-copy";

const appUrl = "https://app.nexaflowsystems.com/login";
const demoEmail =
  "mailto:info@nexaflowsystems.com?subject=NexaFlow%20guided%20demo";

const outcomes = [
  {
    icon: Users,
    label: "Know every account",
    copy: "Keep companies, contacts, buying roles, activities, and notes connected in one dependable record.",
  },
  {
    icon: Workflow,
    label: "Move work forward",
    copy: "Route leads, progress deals, assign next steps, and carry context into delivery without spreadsheet handoffs.",
  },
  {
    icon: Inbox,
    label: "Keep conversations visible",
    copy: "Bring customer communication and team follow-up into the same workspace as the opportunity.",
  },
];

const workflowSteps = [
  [
    "01",
    "Capture",
    "Bring in a lead, company, or contact without losing its source or ownership.",
  ],
  [
    "02",
    "Qualify",
    "Score the opportunity, record the buying context, and agree on the next action.",
  ],
  [
    "03",
    "Advance",
    "Move the deal through a visible pipeline with tasks, conversations, and accountability.",
  ],
  [
    "04",
    "Deliver",
    "Turn a won deal into coordinated project work while preserving the full customer history.",
  ],
];

const principles = [
  {
    icon: Handshake,
    title: "Human decisions stay human",
    copy: "AI can prepare research and drafts. Your team reviews, edits, approves, or discards the work before it reaches a customer.",
  },
  {
    icon: LockKeyhole,
    title: "Access follows responsibility",
    copy: "Roles and workspace boundaries help people see the records and actions relevant to their work.",
  },
  {
    icon: Database,
    title: "Your CRM remains the source of truth",
    copy: "Automation supports the record rather than hiding decisions inside a separate black-box workflow.",
  },
];

export default async function Home() {
  let catalog;
  try {
    catalog = await activeCommercialCatalog();
  } catch {
    catalog = null;
  }
  const marketingPlans = catalog?.map((plan) => ({
    ...plan,
    price: `$${(plan.monthlyCents / 100).toFixed(2)}`,
    recommended: plan.code === "growth",
    copy:
      plan.code === "essentials"
        ? "A focused CRM foundation for a company getting its process in place."
        : plan.code === "growth"
          ? "For a growing revenue team coordinating one pipeline."
          : "For a larger company using advanced roles and automation.",
  }));
  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-accent-soft">
      <header className="sticky top-0 z-50 border-b border-[var(--nx-border-subtle)] bg-[color:var(--nx-surface-primary)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link
            href="#top"
            className="flex items-center gap-3"
            aria-label="NexaFlow home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-[var(--nf-radius-control)] bg-[var(--nx-action-primary)] text-sm font-black text-[var(--nx-action-primary-text)]">
              NF
            </span>
            <span>
              <span className="block text-lg font-black tracking-[-0.03em]">
                NexaFlow
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--nx-text-muted)]">
                Sales to delivery CRM
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-7 text-sm font-semibold lg:flex"
            aria-label="Primary navigation"
          >
            <Link
              href="#product"
              className="transition-colors hover:text-[var(--nx-link)]"
            >
              Product
            </Link>
            <Link
              href="#workflow"
              className="transition-colors hover:text-[var(--nx-link)]"
            >
              How it works
            </Link>
            <Link
              href="#ai"
              className="transition-colors hover:text-[var(--nx-link)]"
            >
              Responsible AI
            </Link>
            <Link
              href="/select-plan"
              className="transition-colors hover:text-[var(--nx-link)]"
            >
              Plans
            </Link>
            <Link
              href="#questions"
              className="transition-colors hover:text-[var(--nx-link)]"
            >
              FAQ
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href={appUrl} className="hidden text-sm font-bold sm:block">
              Sign in
            </Link>
            <Link
              href={demoEmail}
              className="inline-flex items-center gap-2 rounded-[var(--nf-radius-control)] bg-[var(--nx-action-primary)] px-5 py-3 text-sm font-bold text-[var(--nx-action-primary-text)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--nx-action-primary-hover)]"
            >
              Request a demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden border-b border-[var(--nx-border-subtle)]">
          <div className="absolute -right-40 top-10 h-96 w-96 rounded-full bg-[color:var(--nx-action-primary)]/10 blur-3xl" />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
            <div className="relative z-10 self-center">
              <p className="mb-7 flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-link)]">
                <span className="h-px w-10 bg-[var(--nx-link)]" />
                Built for growing B2B teams
              </p>
              <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[5.2rem]">
                Keep the whole customer journey in view.
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--nx-text-muted)] sm:text-xl">
                NexaFlow connects sales, customer communication, and post-sale
                delivery in one practical workspace—so the context behind a deal
                stays with the people responsible for the outcome.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/select-plan"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--nx-action-primary)] px-7 py-4 font-black text-[var(--nx-action-primary-text)] shadow-lg transition-transform hover:-translate-y-0.5"
                >
                  Explore plans <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href={demoEmail}
                  className="inline-flex items-center justify-center gap-2 rounded-[var(--nf-radius-control)] border border-[var(--nx-border-emphasis)] bg-[var(--nx-surface-primary)] px-7 py-4 font-bold text-[var(--nx-text-strong)] hover:bg-[var(--nx-surface-secondary)]"
                >
                  Book a guided walkthrough <ChevronRight className="h-5 w-5" />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[var(--nx-text-muted)]">
                <span className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 text-[var(--nx-success)]" />{" "}
                  CRM foundation
                </span>
                <span className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 text-[var(--nx-success)]" />{" "}
                  Visible handoffs
                </span>
                <span className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 text-[var(--nx-success)]" />{" "}
                  Human-approved AI
                </span>
              </div>
            </div>

            <div className="relative rounded-[2rem] bg-[var(--nx-text-strong)] p-3 shadow-[0_30px_90px_rgb(11_17_24_/_22%)] sm:p-5">
              <div className="rounded-[1.4rem] bg-[var(--nx-surface-primary)] p-5 sm:p-7">
                <div className="flex items-center justify-between border-b border-[var(--nx-border-subtle)] pb-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--nx-link)]">
                      Live opportunity
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight">
                      Northstar Services
                    </h2>
                  </div>
                  <span className="rounded-full bg-[var(--nx-success-surface)] px-3 py-1 text-xs font-black text-[var(--nx-success)]">
                    Qualified
                  </span>
                </div>
                <div className="grid gap-4 py-5 sm:grid-cols-2">
                  <div className="border-l-2 border-[var(--nx-action-primary)] pl-4">
                    <span className="text-xs font-bold text-[var(--nx-text-muted)]">
                      Deal owner
                    </span>
                    <p className="mt-1 font-black">Sales team</p>
                  </div>
                  <div className="border-l-2 border-[var(--nx-border-strong)] pl-4">
                    <span className="text-xs font-bold text-[var(--nx-text-muted)]">
                      Next action
                    </span>
                    <p className="mt-1 font-black">Confirm discovery notes</p>
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl bg-[var(--nx-surface-secondary)] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--nx-text-muted)]">
                    Shared account timeline
                  </p>
                  {[
                    ["Today", "Discovery notes added", MessageSquareText],
                    ["Tomorrow", "Proposal review due", Clock3],
                    ["On approval", "Delivery workspace prepared", Layers3],
                  ].map(([time, text, Icon]) => {
                    const ItemIcon = Icon as typeof Clock3;
                    return (
                      <div
                        key={text as string}
                        className="flex items-center gap-3 rounded-xl bg-[var(--nx-surface-primary)] p-3"
                      >
                        <ItemIcon className="h-4 w-4 text-[var(--nx-link)]" />
                        <span className="min-w-16 text-xs font-black text-[var(--nx-text-muted)]">
                          {time as string}
                        </span>
                        <span className="text-sm font-bold">
                          {text as string}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--nx-text-muted)]">
                  Illustrative workspace using clearly labelled demonstration
                  data.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-b border-[var(--nx-border-subtle)] bg-[var(--nx-surface-primary)] py-7"
          aria-label="NexaFlow benefits"
        >
          <div className="mx-auto grid max-w-7xl gap-5 px-5 text-sm text-[var(--nx-text)] sm:grid-cols-3 lg:px-8">
            <p>
              <strong className="text-[var(--nx-text-strong)]">
                One customer record
              </strong>
              <br />
              Sales, conversations, and delivery context stay connected.
            </p>
            <p>
              <strong className="text-[var(--nx-text-strong)]">
                Clear ownership
              </strong>
              <br />
              Teams can see the next action and the person responsible.
            </p>
            <p>
              <strong className="text-[var(--nx-text-strong)]">
                Human-controlled AI
              </strong>
              <br />
              Suggestions are visible, reviewable, and optional.
            </p>
          </div>
        </section>

        <section className="bg-surface py-20 lg:py-24" id="product">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-link)]">
                  Built around real work
                </p>
                <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                  Less searching. Fewer dropped handoffs.
                </h2>
                <p className="mt-6 text-lg leading-8 text-ink-muted">
                  The product is designed around the moments where revenue teams
                  lose context: ownership changes, follow-ups, customer
                  conversations, and the transition from a signed deal to
                  delivery.
                </p>
                <Link
                  href={appUrl}
                  className="mt-8 inline-flex items-center gap-2 font-black text-[var(--nx-link)]"
                >
                  Open the live CRM sign-in <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
                {outcomes.map(({ icon: Icon, label, copy }) => (
                  <article key={label} className="bg-surface p-7 lg:p-8">
                    <Icon className="h-7 w-7 text-[var(--nx-link)]" />
                    <h3 className="mt-10 text-xl font-black tracking-tight">
                      {label}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-ink-muted">
                      {copy}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="border-y border-line bg-inverse py-20 text-inverse lg:py-24"
        >
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-action-primary)]">
                One continuous customer record
              </p>
              <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                A clearer path from first contact to delivered work.
              </h2>
            </div>
            <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map(([number, title, copy]) => (
                <article key={number} className="border-t border-inverse/20 pt-5">
                  <span className="font-mono text-sm font-black text-[var(--nx-action-primary)]">
                    {number}
                  </span>
                  <h3 className="mt-10 text-2xl font-black">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-inverse/70">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ai" className="bg-surface-muted py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-success">
                  <ShieldCheck className="h-4 w-4" /> Responsible assistance
                </p>
                <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                  AI prepares the work. Your team remains accountable.
                </h2>
                <p className="mt-6 text-lg leading-8 text-ink-muted">
                  NexaFlow uses AI where it can reduce preparation
                  time—research, prioritization, and drafting—while keeping
                  customer-facing decisions visible and reviewable.
                </p>
                <div className="mt-8 rounded-2xl border border-success bg-success-soft p-5">
                  <p className="text-sm font-black text-success">
                    Plain-language promise
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    An AI draft is not a sent message. A suggestion is not a
                    decision. People can review the source, change the output,
                    or do the work manually.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {principles.map(({ icon: Icon, title, copy }) => (
                  <article
                    key={title}
                    className="grid grid-cols-[auto_1fr] gap-5 rounded-2xl border border-line bg-surface p-6"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-inverse text-inverse">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-black">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-ink-muted">
                        {copy}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="plans" className="bg-canvas py-20 lg:py-24">
          <div className="mx-auto max-w-[1440px] px-5 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-link)]">
                Plans
              </p>
              <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Choose the plan that fits your team today.
              </h2>
              <p className="mt-6 text-lg leading-8 text-[var(--nx-text-muted)]">
                Every self-service plan is one Workspace subscription. Included
                active seats count the Workspace Owner.
              </p>
            </div>
            {marketingPlans ? (
              <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {marketingPlans.map((plan) => (
                  <article
                    className={`relative grid gap-4 rounded-panel border bg-surface p-6 text-sm text-ink-muted ${plan.recommended ? "border-accent ring-1 ring-accent" : "border-line"}`}
                    key={plan.code}
                  >
                    {plan.recommended && (
                      <span className="absolute right-4 top-4 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                        Recommended
                      </span>
                    )}
                    <h3>{plan.name}</h3>
                    <p className="leading-6">{plan.copy}</p>
                    <p className="text-sm text-ink-muted [&_b]:text-3xl [&_b]:text-ink">
                      <b>{plan.price}</b>
                      <span> / month</span>
                    </p>
                    <p className="font-semibold text-ink">
                      {activeSeatCopy(plan.seats)}
                    </p>
                    <ul>
                      <li>
                        <CircleCheck aria-hidden="true" /> One company Workspace
                      </li>
                      <li>
                        <CircleCheck aria-hidden="true" /> 14-day trial at
                        creation
                      </li>
                      <li>
                        <CircleCheck aria-hidden="true" /> Owner included in
                        active seats
                      </li>
                    </ul>
                    <Link
                      className="mt-auto inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink"
                      href={`/select-plan?plan=${plan.code}&cadence=monthly`}
                    >
                      Choose {plan.name}
                    </Link>
                  </article>
                ))}
                <article className="grid gap-4 rounded-panel border border-line bg-surface p-6 text-sm text-ink-muted">
                  <p className="text-xs font-bold uppercase tracking-[.08em] text-ink-faint">
                    For larger organizations
                  </p>
                  <h3>Enterprise</h3>
                  <p className="leading-6">
                    A tailored rollout for multiple Workspaces and custom
                    capacity.
                  </p>
                  <p className="text-sm text-ink-muted [&_b]:text-3xl [&_b]:text-ink">
                    <b>Custom</b>
                    <span> Contact Sales</span>
                  </p>
                  <p className="font-semibold text-ink">
                    Designed for multi-Workspace organizations.
                  </p>
                  <ul>
                    <li>
                      <CircleCheck aria-hidden="true" /> Multiple Workspaces
                    </li>
                    <li>
                      <CircleCheck aria-hidden="true" /> Custom commercial terms
                    </li>
                    <li>
                      <CircleCheck aria-hidden="true" /> Guided rollout
                    </li>
                  </ul>
                  <a
                    className="mt-auto inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                    href={demoEmail}
                  >
                    Talk with Sales
                  </a>
                </article>
              </div>
            ) : (
              <p className="mt-8 rounded-control border border-danger bg-danger-soft p-4 text-sm text-danger" role="alert">
                Plans are temporarily unavailable. Contact Sales for help.
              </p>
            )}
            <p className="mt-8 text-center text-sm text-[var(--nx-text-muted)]">
              Billing is not connected in this environment.
            </p>
          </div>
        </section>

        <section
          id="about"
          className="bg-[var(--nx-action-primary)] py-20 text-[var(--nx-action-primary-text)] lg:py-24"
        >
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1.1fr_.9fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-action-primary-text)]/70">
                Why NexaFlow
              </p>
              <h2 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                CRM should help teams serve customers—not create another system
                to manage.
              </h2>
            </div>
            <div className="self-end">
              <p className="text-lg leading-8 text-[var(--nx-action-primary-text)]/85">
                NexaFlow is being built for organizations that need sales
                discipline and delivery visibility without surrendering their
                process to opaque automation. The current UAT product is
                available for guided evaluation and direct feedback.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href={demoEmail}
                  className="rounded-full bg-surface px-6 py-3 font-black text-ink"
                >
                  Talk with the product team
                </Link>
                <a
                  href="tel:+18444823336"
                  className="rounded-full border border-[var(--nx-action-primary-text)]/40 px-6 py-3 font-black"
                >
                  +1 844-482-3336
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="questions" className="bg-surface py-20 lg:py-24">
          <div className="mx-auto max-w-5xl px-5 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--nx-link)]">
                Before you evaluate
              </p>
              <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Straight answers to practical questions.
              </h2>
            </div>
            <div className="mt-12 divide-y divide-line border-y border-line">
              {[
                [
                  "Is NexaFlow available today?",
                  "A UAT environment is live for guided evaluation. Contact the product team to discuss fit, access, and the workflow you want to test.",
                ],
                [
                  "Can we work without AI?",
                  "Yes. Core CRM workflows remain manually operable. AI assistance is designed as an optional layer for preparation and prioritization.",
                ],
                [
                  "What happens after a deal is won?",
                  "A won opportunity can carry its customer context into project and delivery work, reducing the need to recreate the handoff in another tool.",
                ],
                [
                  "How do we discuss security requirements?",
                  "Security and access requirements should be reviewed against your organization’s needs during evaluation. We can walk through roles, data boundaries, deployment, and operational controls.",
                ],
              ].map(([question, answer]) => (
                <details key={question} className="group py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-black">
                    {question}
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-control transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-3xl pt-4 text-sm leading-7 text-ink-muted">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-success-soft py-20">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 lg:flex-row lg:items-end lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-success">
                Start with your workflow
              </p>
              <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                See whether NexaFlow fits the way your team actually works.
              </h2>
            </div>
            <Link
              href={demoEmail}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-inverse px-7 py-4 font-black text-inverse"
            >
              Request a guided demo <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface py-12 text-ink">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <p className="text-xl font-black">NexaFlow Systems</p>
            <p className="mt-3 max-w-lg text-sm leading-6 text-ink-muted">
              A connected sales and delivery workspace for growing B2B teams.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm font-bold sm:flex-row sm:gap-7">
            <a
              href="mailto:info@nexaflowsystems.com"
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4 text-[var(--nx-action-primary)]" />{" "}
              info@nexaflowsystems.com
            </a>
            <a href="tel:+18444823336" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-[var(--nx-action-primary)]" /> +1
              844-482-3336
            </a>
            <Link href={appUrl}>CRM sign in</Link>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-line px-5 pt-6 text-xs text-ink-muted sm:flex-row sm:justify-between lg:px-8">
          <span>
            © {new Date().getFullYear()} NexaFlow Systems. All rights reserved.
          </span>
          <span>UAT product access is provided for evaluation.</span>
        </div>
      </footer>
    </div>
  );
}
