import { Suspense } from "react";
import { LoginForm } from "../onboarding/forms";
import { websiteProvider } from "../onboarding/provider";
import { WebsiteEnvironmentNotice, WebsiteShell } from "../onboarding/website-shell";

export default function Page(){const provider=websiteProvider();return <WebsiteShell action="plans"><WebsiteEnvironmentNotice>Authentication is server-backed. Use only credentials approved for this environment.</WebsiteEnvironmentNotice><Suspense><LoginForm provider={provider} /></Suspense></WebsiteShell>}
