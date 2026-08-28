"use client";

import Link from "next/link";
import { useState } from "react";
import { securePost } from "../onboarding/api";
import { query, type Cadence, type PlanKey } from "../onboarding/logic";

export function PlanAction({
  plan,
  cadence,
  name,
  resume,
}: {
  plan: PlanKey;
  cadence: Cadence;
  name: string;
  resume: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!resume)
    return (
      <Link
        className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink"
        href={`/register?${query(plan, cadence)}`}
      >
        Start with {name}
      </Link>
    );

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { response } = await securePost("/api/onboarding/plan", {
        planCode: plan,
        cadence,
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Sign in again before changing your saved plan."
            : "That plan or cadence is no longer available.",
        );
        setBusy(false);
        return;
      }
      window.location.replace("/workspace/create");
    } catch {
      setError(
        "We couldn’t save this plan intent. Your previous selection is unchanged.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-45"
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void save()}
      >
        {busy ? "Saving selection…" : `Continue with ${name}`}
      </button>
      {error && (
        <p className="rounded-control border border-danger bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
