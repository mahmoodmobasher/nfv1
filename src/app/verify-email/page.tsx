import { WebsiteShell } from "../onboarding/website-shell";
import { VerifyClient } from "./verify-client";

export default async function VerifyEmailPage({searchParams}:{searchParams:Promise<{token?:string;next?:string}>}) {
  const {token,next}=await searchParams;
  return <WebsiteShell action="help"><VerifyClient token={token??null} continuation={next==="/workspace/invitations/accept"?next:null} /></WebsiteShell>;
}
