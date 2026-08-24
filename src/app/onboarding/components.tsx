"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { plans, query, selection } from "./logic";
export { plans, query, selection } from "./logic";

export function Brand() {
  return <Link href="/" className="brand" aria-label="NexaFlow home"><span>NF</span><b>NexaFlow<small>Sales to delivery CRM</small></b></Link>;
}

export function DemoNotice() {
  return <div className="demo-notice" role="note"><ShieldCheck aria-hidden="true" /> <span><b>Local workflow preview</b> No account, password, email, or workspace is sent to a server. Production authentication will be connected later.</span></div>;
}

export function Shell({ children, aside, step, authLink = true, boundary = "foundation" }: { children: React.ReactNode; aside?: React.ReactNode; step?: number; authLink?: boolean; boundary?: "foundation"|"preview" }) {
  const pathname=usePathname();
  const routePreview=pathname==="/invite"?"INVITATION PREVIEW · No invitations, seats, or email are persisted or authorized":pathname==="/workspace/settings"?"SETTINGS PREVIEW · Workspace details, people, roles, and saves are not server-authorized or persisted":pathname==="/crm/leads/new"?"LEAD PREVIEW · No CRM record or onboarding progress is persisted":null;
  const copy=routePreview??(boundary==="foundation"?"LOCAL NON-PRODUCTION · Server-backed identity and workspace foundation":"LOCAL PREVIEW · This route does not persist or authorize production data");
  return <div className="onboarding-page"><div className="preview-banner">{copy}</div><header className="onboarding-header"><Brand />{authLink && <span className="header-action">Already have an account? <Link href="/login">Sign in</Link></span>}</header>{step && <Progress active={step} />}<main className={aside ? "onboarding-layout" : "onboarding-narrow"}><section className="flow-card">{children}</section>{aside}</main><Footer /></div>;
}

function Progress({ active }: { active: number }) {
  const labels = ["Plan", "Account", "Workspace", "CRM"];
  return <nav className="progress" aria-label="Onboarding progress"><p>Step {active} of 4</p><ol>{labels.map((label, i) => <li key={label} className={i + 1 <= active ? "active" : ""}><span>{i + 1 < active ? <Check /> : i + 1}</span>{label}</li>)}</ol></nav>;
}

export type PlanPresentation={plan:keyof typeof plans;name:string;cadence:"monthly"|"annual";seats:number;priceCents:number};
export function PlanSummary({presentation}:{presentation?:PlanPresentation}) {
  const params = useSearchParams();
  const { plan, cadence } = presentation??selection(params);
  const item = plans[plan];
  if (!presentation) return <aside className="plan-summary"><p className="eyebrow">Your selection</p><p>Plan details are unavailable. Choose a plan to continue.</p><Link href="/select-plan">Choose a plan</Link></aside>;
  return <aside className="plan-summary"><p className="eyebrow">Your selection</p><h2>{presentation.name ?? item.name}</h2><p className="price"><b>${(presentation.priceCents/100).toFixed(presentation.priceCents%100?2:0)}</b> {cadence==="annual"?"monthly equivalent, billed annually":"per month"}</p><p>One Workspace subscription includes {presentation.seats} active seats, Owner included.</p><p><Check /> 14-day trial starts when your Workspace is created</p><p>Billing is not connected.</p><Link href={`/select-plan?${query(plan, cadence)}`}>Change plan</Link></aside>;
}

export function Field({ label, name, type = "text", hint, required = true, autoComplete = "off", error, onChange }: { label: string; name: string; type?: string; hint?: string; required?: boolean; autoComplete?: string; error?: string; onChange?: (value:string)=>void }) {
  const [shown,setShown]=useState(false); const password=type==="password"; const described=[hint&&`${name}-hint`,error&&`${name}-error`].filter(Boolean).join(" ")||undefined;
  return <label className="field"><span>{label}{required && <em> Required</em>}</span><span className="input-wrap"><input id={name} name={name} type={password&&!shown?"password":"text"} required={required} autoComplete={autoComplete} aria-required={required} aria-invalid={!!error} aria-describedby={described} onChange={e=>onChange?.(e.target.value)} />{password&&<button type="button" onClick={()=>setShown(!shown)} aria-label={shown?"Hide password":"Show password"}>{shown?<EyeOff/>:<Eye/>}</button>}</span>{hint && <small id={`${name}-hint`}>{hint}</small>}{error&&<small className="field-error" id={`${name}-error`}>{error}</small>}</label>;
}

export function Footer() { return <footer className="onboarding-footer"><span>Privacy · pending publication</span><span>Terms · pending publication</span><a href="mailto:info@nexaflowsystems.com">Need help?</a></footer>; }

export function Requirements({value}:{value:string}){const rows=[[value.length>=12,"At least 12 characters"],[/\d/.test(value),"Includes a number"],[/[^A-Za-z0-9]/.test(value),"Includes a symbol"]] as const;return <ul className="requirements" aria-label="Password requirements">{rows.map(([ok,text])=><li className={ok?"met":""} key={text}><Check/> {text}</li>)}</ul>}

export function ProviderControl({mode}:{mode:"disabled"|"fixture"}) { return mode==="fixture"?<div><a className="google-button link-button" href="/api/auth/oidc/start">Continue with local Google fixture <small>Non-production</small></a><div className="divider"><span>or continue with email</span></div></div>:<Alert>Google sign-in isn’t available in this environment. Use email and password.</Alert>; }

export function Alert({ children, kind = "info" }: { children: React.ReactNode; kind?: "info" | "success" | "error" }) { return <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>; }
