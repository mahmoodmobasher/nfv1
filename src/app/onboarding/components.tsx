"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { plans, query, selection } from "./logic";
export { plans, query, selection } from "./logic";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-ink no-underline"
      aria-label="NexaFlowSystem home"
    >
      <span className="grid size-9 place-items-center rounded-control bg-accent text-sm font-extrabold text-on-accent">
        N
      </span>
      <b className="grid text-[15px] leading-tight">
        NexaFlow<span className="text-accent">System</span>
        <small className="text-[10px] font-medium uppercase tracking-[.08em] text-ink-faint">
          Business CRM
        </small>
      </b>
    </Link>
  );
}

export function DemoNotice() {
  return (
    <div
      className="flex gap-2 rounded-control border border-line bg-surface-muted p-3 text-xs leading-5 text-ink-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
      role="note"
    >
      <ShieldCheck aria-hidden="true" />{" "}
      <span>
        <b>Local workflow preview</b> No account, password, email, or workspace
        is sent to a server. Production authentication will be connected later.
      </span>
    </div>
  );
}

export function Shell({
  children,
  aside,
  step,
  authLink = true,
  boundary = "foundation",
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  step?: number;
  authLink?: boolean;
  boundary?: "foundation" | "preview";
}) {
  void authLink;
  void boundary;
  return (
    <div className="bg-canvas text-ink">
      {step && <Progress active={step} />}
      <main
        className={
          aside
            ? "mx-auto grid max-w-6xl gap-5 px-5 py-8 min-[901px]:grid-cols-[minmax(0,1fr)_18rem]"
            : "mx-auto max-w-xl px-5 py-8"
        }
      >
        <section className="grid gap-5 rounded-panel border border-line bg-surface p-6 shadow-sm sm:p-8 [&_form]:grid [&_form]:gap-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:text-lg [&_h2]:font-semibold [&_a]:text-accent-ink">
          {children}
        </section>
        {aside}
      </main>
    </div>
  );
}

function Progress({ active }: { active: number }) {
  const labels = ["Plan", "Account", "Workspace", "CRM"];
  return (
    <nav
      className="mx-auto max-w-6xl px-5 pt-6 text-xs text-ink-muted"
      aria-label="Onboarding progress"
    >
      <p className="mb-3 font-semibold">Step {active} of 4</p>
      <ol className="grid grid-cols-4 gap-2">
        {labels.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 border-t-2 pt-2 ${i + 1 <= active ? "border-accent text-ink" : "border-line"}`}
          >
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] ${i + 1 <= active ? "bg-accent text-on-accent" : "bg-surface-muted"}`}
            >
              {i + 1 < active ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export type PlanPresentation = {
  plan: keyof typeof plans;
  name: string;
  cadence: "monthly" | "annual";
  seats: number;
  priceCents: number;
};
export function PlanSummary({
  presentation,
}: {
  presentation?: PlanPresentation;
}) {
  const params = useSearchParams();
  const { plan, cadence } = presentation ?? selection(params);
  const item = plans[plan];
  if (!presentation)
    return (
      <aside className="sticky top-5 grid gap-3 self-start rounded-panel border border-line bg-surface p-5 text-sm text-ink-muted">
        <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
          Your selection
        </p>
        <p>Plan details are unavailable. Choose a plan to continue.</p>
        <Link className="font-semibold text-accent-ink" href="/select-plan">
          Choose a plan
        </Link>
      </aside>
    );
  return (
    <aside className="sticky top-5 grid gap-3 self-start rounded-panel border border-line bg-surface p-5 text-sm text-ink-muted">
      <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
        Your selection
      </p>
      <h2 className="text-lg font-semibold text-ink">
        {presentation.name ?? item.name}
      </h2>
      <p>
        <b className="text-xl text-ink">
          $
          {(presentation.priceCents / 100).toFixed(
            presentation.priceCents % 100 ? 2 : 0,
          )}
        </b>{" "}
        {cadence === "annual"
          ? "monthly equivalent, billed annually"
          : "per month"}
      </p>
      <p>
        One Workspace subscription includes {presentation.seats} active{" "}
        {presentation.seats === 1 ? "seat" : "seats"}, Owner included.
      </p>
      <p className="flex gap-2">
        <Check className="size-4 text-success" /> 14-day trial starts when your
        Workspace is created
      </p>
      <p>Billing is not connected.</p>
      <Link
        className="font-semibold text-accent-ink"
        href={`/select-plan?${query(plan, cadence)}`}
      >
        Change plan
      </Link>
    </aside>
  );
}

export function Field({
  label,
  name,
  type = "text",
  hint,
  required = true,
  autoComplete = "off",
  error,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const password = type === "password";
  const described =
    [hint && `${name}-hint`, error && `${name}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted">
      <span>
        {label}
        {required && <em className="font-normal text-danger"> Required</em>}
      </span>
      <span className="relative">
        <input
          className="min-h-11 w-full rounded-control border border-control bg-surface px-3 pr-10 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          id={name}
          name={name}
          type={password && !shown ? "password" : "text"}
          required={required}
          autoComplete={autoComplete}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={described}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {password && (
          <button
            className="absolute inset-y-0 right-0 grid min-w-11 place-items-center text-ink-muted"
            type="button"
            onClick={() => setShown(!shown)}
            aria-label={shown ? "Hide password" : "Show password"}
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </span>
      {hint && (
        <small className="font-normal text-ink-faint" id={`${name}-hint`}>
          {hint}
        </small>
      )}
      {error && (
        <small className="font-normal text-danger" id={`${name}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}

export function Footer() {
  return (
    <footer className="flex flex-wrap justify-center gap-5 px-5 py-8 text-xs text-ink-faint">
      <span>Privacy · pending publication</span>
      <span>Terms · pending publication</span>
      <a href="mailto:info@nexaflowsystems.com">Need help?</a>
    </footer>
  );
}

export function Requirements({ value }: { value: string }) {
  const rows = [
    [value.length >= 12, "At least 12 characters"],
    [/\d/.test(value), "Includes a number"],
    [/[^A-Za-z0-9]/.test(value), "Includes a symbol"],
  ] as const;
  return (
    <ul
      className="grid gap-1 text-xs text-ink-faint"
      aria-label="Password requirements"
    >
      {rows.map(([ok, text]) => (
        <li
          className={`flex items-center gap-2 ${ok ? "text-success" : ""}`}
          key={text}
        >
          <Check className="size-3.5" /> {text}
        </li>
      ))}
    </ul>
  );
}

export function ProviderControl({ mode }: { mode: "disabled" | "fixture" }) {
  return mode === "fixture" ? (
    <div className="grid gap-4">
      <a
        className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
        href="/api/auth/oidc/start"
      >
        Continue with local Google fixture{" "}
        <small className="ml-2 text-ink-faint">Non-production</small>
      </a>
      <div className="flex items-center gap-3 text-xs text-ink-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        <span>or continue with email</span>
      </div>
    </div>
  ) : (
    <Alert>
      Google sign-in isn’t available in this environment. Use email and
      password.
    </Alert>
  );
}

export function Alert({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "success" | "error";
}) {
  const tone =
    kind === "error"
      ? "border-danger bg-danger-soft text-danger"
      : kind === "success"
        ? "border-success bg-success-soft text-success"
        : "border-line bg-surface-muted text-ink-muted";
  return (
    <div
      className={`rounded-control border p-3 text-sm leading-5 ${tone}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
