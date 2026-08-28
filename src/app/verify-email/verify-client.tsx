"use client";

import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { securePost } from "../onboarding/api";
import { Alert, PlanSummary, Shell } from "../onboarding/components";

type VerificationState =
  "waiting" | "checking" | "verified" | "invalid" | "resent" | "delivery-error";

export function VerifyClient({
  hasIntent,
  invalidIntent,
  continuation,
}: {
  hasIntent: boolean;
  invalidIntent: boolean;
  continuation: string | null;
}) {
  const started = useRef(false);
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [state, setState] = useState<VerificationState>(
      hasIntent ? "checking" : invalidIntent ? "invalid" : "waiting",
    );

  useEffect(() => setEmail(sessionStorage.getItem("nexaDemoEmail") ?? ""), []);
  useEffect(() => {
    if (!hasIntent || started.current) return;
    started.current = true;
    securePost("/verify-email/complete", {})
      .then(({ response }) => setState(response.ok ? "verified" : "invalid"))
      .catch(() => setState("invalid"));
  }, [hasIntent]);

  async function resend() {
    if (!email) {
      setState("delivery-error");
      return;
    }
    setBusy(true);
    try {
      const { response } = await securePost("/api/auth/resend-verification", {
        email,
        ...(continuation ? { continuation } : {}),
      });
      if (!response.ok) throw new Error("delivery_unavailable");
      setState("resent");
    } catch {
      setState("delivery-error");
    } finally {
      setBusy(false);
    }
  }

  const registrationHref = continuation
      ? `/register?next=${encodeURIComponent(continuation)}`
      : "/register",
    loginHref = continuation
      ? `/login?next=${encodeURIComponent(continuation)}`
      : "/login";
  const aside = continuation ? (
    <aside className="sticky top-5 rounded-panel border border-line bg-surface p-5">
      <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
        Workspace invitation
      </p>
      <h2>Invitation account verification</h2>
      <p>
        Email verification only activates your account. Review and accept the
        invitation after you sign in.
      </p>
    </aside>
  ) : (
    <PlanSummary />
  );
  if (state === "checking")
    return (
      <Shell step={2} aside={aside}>
        <div role="status" aria-live="polite">
          <h1>Verifying your email…</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
            Please wait while we check this one-time link.
          </p>
        </div>
      </Shell>
    );
  if (state === "invalid")
    return (
      <Shell step={2} aside={aside}>
        <h1>This verification link is no longer valid</h1>
        <Alert kind="error">
          This link is invalid, expired, replaced, or already used.
        </Alert>
        {email ? (
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-45"
            onClick={resend}
            disabled={busy}
          >
            {busy ? "Requesting…" : "Request another link"}
          </button>
        ) : (
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink" href={registrationHref}>
            Return to registration
          </Link>
        )}
      </Shell>
    );
  if (state === "verified")
    return (
      <Shell step={2} aside={aside}>
        <div className="grid size-12 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-5">
          <Check aria-hidden="true" />
        </div>
        <h1>Email verified</h1>
        <Alert kind="success">
          Your account is active. Sign in to continue.
        </Alert>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink" href={loginHref}>
          Continue to sign in
        </Link>
      </Shell>
    );
  return (
    <Shell step={2} aside={aside}>
      <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-5">
        <Mail aria-hidden="true" />
      </div>
      <h1>Check your email</h1>
      {email ? (
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
          A verification message was queued for <b>{email}</b>.
        </p>
      ) : (
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
          Use the verification message sent after registration.
        </p>
      )}
      <Alert>
        Delivery can take a few minutes. Check your spam or junk folder, then
        resend if the message does not arrive.
      </Alert>
      {state === "resent" && (
        <Alert kind="success">
          If the pending account exists, a replacement link was queued. Older
          links cannot be used.
        </Alert>
      )}
      {state === "delivery-error" && (
        <Alert kind="error">
          Verification delivery is unavailable. Try again or return to
          registration.
        </Alert>
      )}
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-control bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-45"
        onClick={resend}
        disabled={busy || !email}
      >
        {busy ? "Requesting…" : "Resend verification email"}
      </button>
      <p className="text-center text-xs text-ink-muted [&_a]:font-semibold [&_a]:text-accent-ink">
        <Link href={registrationHref}>Wrong email or need to start again?</Link>
      </p>
    </Shell>
  );
}
