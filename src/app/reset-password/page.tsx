import { ResetForm } from "../onboarding/forms";
import { WebsiteShell } from "../onboarding/website-shell";
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <WebsiteShell action="help"><ResetForm token={token??null} /></WebsiteShell>}
