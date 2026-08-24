import { Suspense } from "react";
import { RegisterForm } from "../onboarding/forms";
import { websiteProvider } from "../onboarding/provider";
import { WebsiteEnvironmentNotice, WebsiteShell } from "../onboarding/website-shell";

export default function Page(){const provider=websiteProvider();return <WebsiteShell action="login"><WebsiteEnvironmentNotice>Identity and password security are server-backed. Do not reuse a password from another service.</WebsiteEnvironmentNotice><Suspense><RegisterForm provider={provider} /></Suspense></WebsiteShell>}
