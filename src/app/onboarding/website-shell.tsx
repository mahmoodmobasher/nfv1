import Link from "next/link";
import type { ReactNode } from "react";

export type WebsiteAction = "login" | "plans" | "help" | "none";

export function WebsiteBrand() {
  return <Link href="/" className="brand website-brand" aria-label="NexaFlow home"><span>NF</span><b>NexaFlow<small>Sales to delivery CRM</small></b></Link>;
}

export function WebsiteShell({ children, action = "login" }: { children: ReactNode; action?: WebsiteAction }) {
  return <div className="experience-website website-root"><a className="skip-link" href="#website-main">Skip to main content</a><header className="website-header"><WebsiteBrand /><div className="website-header-action">{action === "login" ? <>Already have an account? <Link href="/login">Sign in</Link></> : action === "plans" ? <Link href="/select-plan">Choose a plan</Link> : action === "help" ? <a href="mailto:info@nexaflowsystems.com">Need help?</a> : null}</div></header><main id="website-main" tabIndex={-1}>{children}</main><footer className="website-footer"><span>Privacy · pending publication</span><span>Terms · pending publication</span><a href="mailto:info@nexaflowsystems.com">Need help?</a></footer></div>;
}

export function WebsiteEnvironmentNotice({ children }: { children: ReactNode }) {
  return <div className="website-environment" role="note">{children}</div>;
}
