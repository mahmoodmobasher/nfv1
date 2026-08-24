import { WebsiteShell } from "../onboarding/website-shell";
import { VerifyClient } from "./verify-client";

export default async function VerifyEmailPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const {token}=await searchParams;
  return <WebsiteShell action="help"><VerifyClient token={token??null} /></WebsiteShell>;
}
