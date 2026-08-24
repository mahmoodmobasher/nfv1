"use client";

import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { securePost } from "../onboarding/api";
import { Alert, PlanSummary, Shell } from "../onboarding/components";

type VerificationState="waiting"|"checking"|"verified"|"invalid"|"resent"|"delivery-error";

export function VerifyClient({hasIntent,invalidIntent,continuation}:{hasIntent:boolean;invalidIntent:boolean;continuation:string|null}) {
  const started=useRef(false);
  const[email,setEmail]=useState(""),[busy,setBusy]=useState(false),[state,setState]=useState<VerificationState>(hasIntent?"checking":invalidIntent?"invalid":"waiting");

  useEffect(()=>setEmail(sessionStorage.getItem("nexaDemoEmail")??""),[]);
  useEffect(()=>{
    if(!hasIntent||started.current)return;
    started.current=true;
    securePost("/verify-email/complete",{})
      .then(({response})=>setState(response.ok?"verified":"invalid"))
      .catch(()=>setState("invalid"));
  },[hasIntent]);

  async function resend(){
    if(!email){setState("delivery-error");return}
    setBusy(true);
    try{const {response}=await securePost("/api/auth/resend-verification",{email,...(continuation?{continuation}:{})});if(!response.ok)throw new Error("delivery_unavailable");setState("resent")}
    catch{setState("delivery-error")}
    finally{setBusy(false)}
  }

  const registrationHref=continuation?`/register?next=${encodeURIComponent(continuation)}`:"/register",loginHref=continuation?`/login?next=${encodeURIComponent(continuation)}`:"/login";
  const aside=continuation?<aside className="plan-summary"><p className="eyebrow">Workspace invitation</p><h2>Invitation account verification</h2><p>Email verification only activates your account. Review and accept the invitation after you sign in.</p></aside>:<PlanSummary/>;
  if(state==="checking")return <Shell step={2} aside={aside}><div role="status" aria-live="polite"><h1>Verifying your email…</h1><p className="lead">Please wait while we check this one-time link.</p></div></Shell>;
  if(state==="invalid")return <Shell step={2} aside={aside}><h1>This verification link is no longer valid</h1><Alert kind="error">This link is invalid, expired, replaced, or already used.</Alert>{email?<button className="primary" onClick={resend} disabled={busy}>{busy?"Requesting…":"Request another link"}</button>:<Link className="primary link-button" href={registrationHref}>Return to registration</Link>}</Shell>;
  if(state==="verified")return <Shell step={2} aside={aside}><div className="icon-orb success"><Check aria-hidden="true"/></div><h1>Email verified</h1><Alert kind="success">Your account is active. Sign in to continue.</Alert><Link className="primary link-button" href={loginHref}>Continue to sign in</Link></Shell>;
  return <Shell step={2} aside={aside}><div className="icon-orb"><Mail aria-hidden="true"/></div><h1>Check your email</h1>{email?<p className="lead">A verification message was queued for <b>{email}</b>.</p>:<p className="lead">Use the verification message sent after registration.</p>}<Alert>Delivery can take a few minutes. Check your spam or junk folder, then resend if the message does not arrive.</Alert>{state==="resent"&&<Alert kind="success">If the pending account exists, a replacement link was queued. Older links cannot be used.</Alert>}{state==="delivery-error"&&<Alert kind="error">Verification delivery is unavailable. Try again or return to registration.</Alert>}<button className="secondary" onClick={resend} disabled={busy||!email}>{busy?"Requesting…":"Resend verification email"}</button><p className="below"><Link href={registrationHref}>Wrong email or need to start again?</Link></p></Shell>;
}
