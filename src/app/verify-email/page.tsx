"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Mail } from "lucide-react";
import { Alert, PlanSummary, Shell } from "../onboarding/components";
import { securePost } from "../onboarding/api";

export default function Verify() {
  const params=useSearchParams(),token=params.get("token"),started=useRef(false);
  const[email,setEmail]=useState("your email"),[state,setState]=useState<"waiting"|"checking"|"verified"|"invalid"|"resent">(token?"checking":"waiting");
  useEffect(()=>setEmail(sessionStorage.getItem("nexaDemoEmail")||"your email"),[]);
  useEffect(()=>{if(!token||started.current)return;started.current=true;securePost("/api/auth/verify",{token}).then(({response})=>setState(response.ok?"verified":"invalid")).catch(()=>setState("invalid"))},[token]);
  async function resend(){await securePost("/api/auth/resend-verification",{email});setState("resent")}
  if(state==="checking")return <Shell step={2} aside={<PlanSummary/>}><h1>Verifying your email…</h1></Shell>;
  if(state==="invalid")return <Shell step={2} aside={<PlanSummary/>}><h1>This verification link is no longer valid</h1><Alert kind="error">This link is invalid, expired, replaced, or already used.</Alert><button className="primary" onClick={resend}>Request another link</button></Shell>;
  if(state==="verified")return <Shell step={2} aside={<PlanSummary/>}><div className="icon-orb success"><Check/></div><h1>Email verified</h1><Alert kind="success">Your account is active. Sign in to continue.</Alert><Link className="primary link-button" href="/login">Continue to sign in</Link></Shell>;
  return <Shell step={2} aside={<PlanSummary/>}><div className="icon-orb"><Mail/></div><h1>Check your email</h1><p className="lead">A verification message was queued for <b>{email}</b>.</p><Alert>Delivery uses the configured transactional email service. Development delivery is available in Mailpit.</Alert>{state==="resent"&&<Alert kind="success">If the pending account exists, a replacement link was queued. Older links cannot be used.</Alert>}<button className="secondary" onClick={resend}>Resend verification email</button><p className="below"><Link href="/register">Wrong email?</Link></p></Shell>;
}
