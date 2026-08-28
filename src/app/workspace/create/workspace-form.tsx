"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Field, Shell } from "../../onboarding/components";
import { securePost } from "../../onboarding/api";
import { query, type Cadence, type PlanKey } from "../../onboarding/logic";

type PlanContext = {
  code: PlanKey;
  name: string;
  cadence: Cadence;
  seats: number;
  trialDays: number;
  priceCents: number;
};

export function WorkspaceForm({ plan }: { plan: PlanContext }) {
  const summary = useRef<HTMLDivElement>(null),
    idempotencyKey = useRef<string | null>(null),
    submitting = useRef(false);
  const [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [nameError, setNameError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    const name = String(
      new FormData(event.currentTarget).get("workspace"),
    ).trim();
    if (!name) {
      setNameError("Enter a company or Workspace name.");
      setFormError("");
      setTimeout(() => summary.current?.focus());
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFormError("");
    setNameError("");
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const { response, data } = await securePost<{ code?: string }>(
        "/api/workspaces",
        { name, idempotencyKey: idempotencyKey.current },
      );
      if (!response.ok) {
        if (data.code === "not_eligible")
          setFormError(
            "This subscription already has its company Workspace. Open it, choose an existing Workspace you can access, or contact Sales for Enterprise multi-Workspace capacity.",
          );
        else if (data.code === "invalid_plan")
          setFormError(
            "The saved plan is no longer available. Choose an active plan before trying again.",
          );
        else
          setFormError(
            "We couldn’t create the Workspace. Your name and saved plan are unchanged; try again.",
          );
        submitting.current = false;
        setBusy(false);
        setTimeout(() => summary.current?.focus());
        return;
      }
      window.location.replace("/workspace/ready");
    } catch {
      setFormError(
        "We couldn’t create the Workspace. Your name and saved plan are unchanged; try again.",
      );
      submitting.current = false;
      setBusy(false);
      setTimeout(() => summary.current?.focus());
    }
  }

  const planSummary = (
    <aside
      className="sticky top-5 rounded-panel border border-line bg-surface p-5"
      aria-labelledby="workspace-plan-heading"
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
        Confirm current plan terms
      </p>
      <h2 id="workspace-plan-heading">{plan.name}</h2>
      <p className="text-sm text-ink-muted [&_b]:text-xl [&_b]:text-ink">
        <b>${(plan.priceCents / 100).toFixed(plan.priceCents % 100 ? 2 : 0)}</b>{" "}
        {plan.cadence === "annual"
          ? "monthly equivalent, billed annually"
          : "per month"}
      </p>
      <p>
        One Workspace subscription includes {plan.seats} active{" "}
        {plan.seats === 1 ? "seat" : "seats"}, Owner included.
      </p>
      <p>
        <Check aria-hidden="true" /> {plan.trialDays}-day trial starts when this
        Workspace is created.
      </p>
      <p>Billing is not connected.</p>
      <Link href={`/select-plan?${query(plan.code, plan.cadence)}`}>
        Change plan intent
      </Link>
    </aside>
  );

  return (
    <Shell step={3} aside={planSummary}>
      <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
        Company Workspace
      </p>
      <h1>Create your company Workspace</h1>
      <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
        Your subscription includes one Workspace for this company. After
        creation, you will be its sole Owner. Included seats count the Owner.
      </p>
      {(formError || nameError) && (
        <div
          ref={summary}
          className="rounded-control border border-danger bg-danger-soft p-3 text-sm text-danger outline-none focus:ring-2 focus:ring-danger"
          tabIndex={-1}
          role="alert"
        >
          <div>
            <b>We couldn’t complete Workspace creation.</b>
            {nameError ? (
              <ul>
                <li>
                  <a href="#workspace">{nameError}</a>
                </li>
              </ul>
            ) : (
              <p>{formError}</p>
            )}
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <Field
          label="Company or Workspace name"
          name="workspace"
          error={nameError || undefined}
          hint="Use the company name your team will recognize."
        />
        <div className="rounded-control border border-line bg-surface-muted p-4 text-sm text-ink-muted [&_b]:text-ink">
          <b>You’ll be the sole initial Owner</b>
          <p>
            Owner is distinct from Admin and controls subscription, ownership
            and governance. Invited Admins operate only within server-authorized
            limits.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-45"
          disabled={busy}
        >
          {busy ? "Creating Workspace…" : "Create company Workspace"}
        </button>
      </form>
    </Shell>
  );
}
