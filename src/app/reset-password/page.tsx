import { cookies } from "next/headers";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentSettings, openIdentityTokenIntent } from "@/server/identity/token-intent";
import { ResetForm } from "../onboarding/forms";
import { WebsiteShell } from "../onboarding/website-shell";
export default async function Page(){const env=getServerEnv(),value=(await cookies()).get(identityTokenIntentSettings("password_reset").cookie)?.value,intent=openIdentityTokenIntent("password_reset",value,env.SESSION_SECRET);return <WebsiteShell action="help"><ResetForm hasIntent={Boolean(intent)} /></WebsiteShell>}
