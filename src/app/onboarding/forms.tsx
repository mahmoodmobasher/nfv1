"use client";
import Link from "next/link";
import { FormEvent, RefObject, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Field, GoogleUnavailable, PlanSummary, query, Requirements, selection, Shell } from "./components";
import { validEmail, validPassword } from "./logic";
import { securePost } from "./api";

type Errors = Record<string, string>;
function focusSummary(ref: RefObject<HTMLDivElement | null>): void { setTimeout(() => ref.current?.focus()); }
function Summary({ errors, summary }: { errors: Errors; summary: RefObject<HTMLDivElement | null> }) {
  if (!Object.keys(errors).length) return null;
  return <div ref={summary} className="alert error error-summary" tabIndex={-1} role="alert"><div><b>Please correct the following:</b><ul>{Object.entries(errors).map(([id, message]) => <li key={id}><a href={`#${id}`}>{message}</a></li>)}</ul></div></div>;
}

export function RegisterForm() {
  const choice = selection(useSearchParams()), summary = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false), [password, setPassword] = useState(""), [errors, setErrors] = useState<Errors>({});
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const data = new FormData(event.currentTarget), next: Errors = {}, email = String(data.get("email"));
    if (!String(data.get("name")).trim()) next.name = "Enter your full name.";
    if (!validEmail(email)) next.email = "Enter a valid work email address.";
    if (!validPassword(password)) next.password = "Use at least 12 characters, including a number and a symbol.";
    if (!data.get("terms")) next.terms = "Accept the terms to create an account.";
    setErrors(next); if (Object.keys(next).length) return focusSummary(summary);
    // A full navigation reliably leaves the completed mutation state after the server response.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    setBusy(true); try { const { response } = await securePost("/api/auth/register", { email, displayName: String(data.get("name")), password, planCode: choice.plan, cadence: choice.cadence }); if (!response.ok) throw new Error("registration_failed"); sessionStorage.setItem("nexaDemoEmail", email); window.location.href = `/verify-email?${query(choice.plan, choice.cadence)}`; } catch { setErrors({ form: "We couldn’t create your account. Try again." }); focusSummary(summary); setBusy(false); }
  }
  return <Shell step={2} aside={<PlanSummary />}><p className="eyebrow">Account</p><h1>Create your NexaFlow account</h1><p className="lead">You’ll create your workspace after we verify your identity.</p><Alert><b>LOCAL NON-PRODUCTION ENVIRONMENT.</b> Your account and Argon2id password hash are persisted by the local server foundation. Do not reuse a production password.</Alert><GoogleUnavailable /><Summary errors={errors} summary={summary} />{errors.form&&<Alert kind="error">{errors.form}</Alert>}<form onSubmit={submit} noValidate><Field label="Full name" name="name" error={errors.name} /><Field label="Work email" name="email" type="email" error={errors.email} /><Field label="Password" name="password" type="password" error={errors.password} onChange={setPassword} autoComplete="new-password" /><Requirements value={password} /><label className="check"><input id="terms" name="terms" type="checkbox" aria-invalid={!!errors.terms} aria-describedby={errors.terms ? "terms-error" : undefined} /><span>I agree to the Terms of Service and Privacy Policy.{errors.terms && <small className="field-error" id="terms-error"> {errors.terms}</small>}</span></label><button className="primary" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button></form><p className="below">Already have an account? <Link href="/login">Sign in</Link></p></Shell>;
}

export function LoginForm() {
  const summary = useRef<HTMLDivElement>(null); const [busy, setBusy] = useState(false), [errors, setErrors] = useState<Errors>({});
  // A full navigation ensures the newly issued HttpOnly session cookie reaches the protected server page.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); const data = new FormData(event.currentTarget), next: Errors = {}, email = String(data.get("email")), password = String(data.get("password")); if (!validEmail(email)) next.email = "Enter a valid email address."; if (!password) next.password = "Enter your password."; setErrors(next); if (Object.keys(next).length) return focusSummary(summary); setBusy(true); try { const { response } = await securePost("/api/auth/login", { email, password }); if (!response.ok) { setErrors({ form: "The email or password is incorrect." }); setBusy(false); return focusSummary(summary); } window.location.href = "/workspace/create"; } catch { setErrors({ form: "Sign-in is unavailable. Try again." }); focusSummary(summary); setBusy(false); } }
  return <Shell authLink={false}><p className="eyebrow">Account access</p><h1>Welcome back</h1><p className="lead">Sign in to continue your server-backed onboarding.</p><Alert><b>LOCAL NON-PRODUCTION ENVIRONMENT.</b> Authentication and sessions are persisted by the local server foundation.</Alert><GoogleUnavailable /><Summary errors={errors} summary={summary} />{errors.form&&<Alert kind="error">{errors.form}</Alert>}<form onSubmit={submit} noValidate><Field label="Email" name="email" type="email" error={errors.email} /><div className="field-row"><span /><Link href="/forgot-password">Forgot password?</Link></div><Field label="Password" name="password" type="password" autoComplete="current-password" error={errors.password} /><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form><p className="below">New to NexaFlow? <Link href="/select-plan">Choose a plan</Link></p></Shell>;
}

export function ForgotForm() {
  const summary = useRef<HTMLDivElement>(null); const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [errors, setErrors] = useState<Errors>({});
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); const email = String(new FormData(event.currentTarget).get("email")), next: Errors = {}; if (!validEmail(email)) next.email = "Enter a valid email address."; setErrors(next); if (Object.keys(next).length) return focusSummary(summary); setBusy(true); try { await securePost("/api/auth/reset-request", { email }); setSent(true); } catch { setErrors({ form: "The recovery service is unavailable." }); } finally { setBusy(false); } }
  return <Shell authLink={false}><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><p className="lead">Enter your email. The response is identical whether or not an account exists.</p>{sent ? <Alert kind="success"><b>Check your email.</b> If a matching active account exists, a recovery message was queued to its configured inbox.</Alert> : <><Summary errors={errors} summary={summary} />{errors.form&&<Alert kind="error">{errors.form}</Alert>}<form onSubmit={submit} noValidate><Field label="Email" name="email" type="email" error={errors.email} /><button className="primary" disabled={busy}>{busy ? "Submitting…" : "Send reset link"}</button></form></>}<p className="below"><Link href="/login">Back to sign in</Link></p></Shell>;
}

export function ResetForm() {
  const token = useSearchParams().get("token"), summary = useRef<HTMLDivElement>(null); const [done, setDone] = useState(false), [busy,setBusy]=useState(false), [password, setPassword] = useState(""), [errors, setErrors] = useState<Errors>({});
  if (!token) return <Shell authLink={false}><h1>This reset link is no longer valid</h1><Alert kind="error">A valid reset link is required.</Alert><Link className="primary link-button" href="/forgot-password">Request a new link</Link></Shell>;
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); const confirm = String(new FormData(event.currentTarget).get("confirm")), next: Errors = {}; if (!validPassword(password)) next.password = "Use at least 12 characters, including a number and a symbol."; if (password !== confirm) next.confirm = "Passwords do not match."; setErrors(next); if (Object.keys(next).length) return focusSummary(summary); setBusy(true); try { const {response}=await securePost("/api/auth/reset-complete",{token,password}); if(!response.ok){setErrors({form:"This reset link is invalid, expired, or already used."});return focusSummary(summary)}setDone(true)}catch{setErrors({form:"The recovery service is unavailable."})}finally{setBusy(false)} }
  return <Shell authLink={false}><h1>Choose a new password</h1><Alert>LOCAL NON-PRODUCTION ENVIRONMENT · A successful reset updates the server-backed credential and revokes existing sessions.</Alert>{done ? <><Alert kind="success">Password updated and existing sessions revoked.</Alert><Link className="primary link-button" href="/login">Continue to sign in</Link></> : <><Summary errors={errors} summary={summary} />{errors.form&&<Alert kind="error">{errors.form}</Alert>}<form onSubmit={submit} noValidate><Field label="New password" name="password" type="password" error={errors.password} onChange={setPassword} autoComplete="new-password" /><Requirements value={password} /><Field label="Confirm new password" name="confirm" type="password" error={errors.confirm} autoComplete="new-password" /><button className="primary" disabled={busy}>{busy?"Saving…":"Save new password"}</button></form></>}</Shell>;
}

export function WorkspaceForm({persisted}:{persisted:{plan:"essentials"|"growth"|"scale";cadence:"monthly"|"annual"}}) {
  const choice = persisted, summary = useRef<HTMLDivElement>(null); const [busy, setBusy] = useState(false), [errors, setErrors] = useState<Errors>({}), key=useRef(crypto.randomUUID());
  // Full navigation reliably reloads newly provisioned server authority after the mutation.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("workspace")).trim(), next: Errors = {}; if (!name) next.workspace = "Enter a workspace name."; setErrors(next); if (Object.keys(next).length) return focusSummary(summary); setBusy(true); try{await securePost("/api/onboarding/plan",{planCode:choice.plan,cadence:choice.cadence});const {response}=await securePost("/api/workspaces",{name,idempotencyKey:key.current});if(!response.ok)throw new Error("provision_failed");window.location.href="/workspace/ready"}catch{setErrors({form:"We couldn’t create the workspace. Your selection is preserved; try again."});focusSummary(summary);setBusy(false)} }
  return <Shell step={3} aside={<PlanSummary persisted={persisted} />}><p className="eyebrow">Workspace</p><h1>Create your workspace</h1><p className="lead">Your saved plan and cadence are loaded from your authenticated onboarding record.</p><Summary errors={errors} summary={summary} /><form onSubmit={submit} noValidate><Field label="Workspace name" name="workspace" error={errors.workspace} hint="Usually your company or team name. You can change it later." /><div className="owner-panel"><b>You’ll be the Workspace Owner</b><p>You can manage billing, invite users, and assign roles.</p></div><p className="trial">Your 14-day trial starts when your workspace is created.</p><button className="primary" disabled={busy}>{busy ? "Creating workspace…" : "Create workspace"}</button></form><p className="below"><Link href={`/select-plan?${query(choice.plan, choice.cadence)}`}>Change saved plan</Link></p></Shell>;
}
