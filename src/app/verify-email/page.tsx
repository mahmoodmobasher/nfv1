import { cookies } from "next/headers";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentSettings, readIdentityTokenIntent } from "@/server/identity/token-intent";
import { WebsiteShell } from "../onboarding/website-shell";
import { VerifyClient } from "./verify-client";

export default async function VerifyEmailPage() {
  const env=getServerEnv(),value=(await cookies()).get(identityTokenIntentSettings("email_verification").cookie)?.value,intent=readIdentityTokenIntent("email_verification",value,env.SESSION_SECRET);
  return <WebsiteShell action="help"><VerifyClient hasIntent={Boolean(intent)} invalidIntent={Boolean(value&&!intent)} continuation={intent?.continuation??null} /></WebsiteShell>;
}
