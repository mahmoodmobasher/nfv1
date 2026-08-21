"use client";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { Brand } from "../onboarding/components";
import { securePost } from "../onboarding/api";

export function CrmShell({workspace,role,children}:{workspace:string;role:string;children:React.ReactNode}){
  const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),trigger=useRef<HTMLButtonElement>(null);
  function close(focus=true){setOpen(false);if(focus)setTimeout(()=>trigger.current?.focus())}
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&open)close()};document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key)},[open]);
  function navigate(event:React.MouseEvent<HTMLAnchorElement>){
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    window.location.assign(event.currentTarget.href);
  }
  async function logout(){setBusy(true);setError("");try{const{response}=await securePost("/api/auth/logout",{scope:"current"});if(!response.ok)throw new Error();window.location.replace("/login?signedOut=1")}catch{setError("We couldn’t securely sign you out. Your session remains active; try again.");setBusy(false)}}
  const nav=()=><nav aria-label="CRM navigation"><Link href="/crm" onClick={navigate}>Leads</Link><Link href="/crm/pipeline" onClick={navigate}>Pipeline</Link><Link href="/crm/leads/new" onClick={navigate}>Add lead</Link><Link href="/workspace/settings/people" onClick={navigate}>People and roles</Link><Link href="/workspace/settings" onClick={navigate}>Workspace settings</Link><button className="signout" onClick={logout} disabled={busy}><LogOut/>{busy?"Signing out…":"Sign out"}</button></nav>;
  return <div className="crm-preview"><aside><Brand/><div className="admin-workspace"><b>{workspace}</b><span>{role}</span></div>{nav()}</aside><header className="mobile-crm"><Brand/><button ref={trigger} className="menu-button" aria-label={open?"Close CRM navigation":"Open CRM navigation"} aria-expanded={open} aria-controls="crm-menu" onClick={()=>open?close():setOpen(true)}>{open?<X/>:<Menu/>}</button>{open&&<div id="crm-menu" className="mobile-menu"><button className="menu-backdrop" aria-label="Close CRM navigation" onClick={()=>close()}/><div className="mobile-menu-panel">{nav()}</div></div>}</header><main><div className="preview-banner">LOCAL SERVER · Leads, pipeline, ownership, visibility, notes, and activities are saved and authorized by the local server. Production providers and deployment are not connected.</div>{error&&<div className="alert error" role="alert">{error}</div>}{children}</main></div>;
}
