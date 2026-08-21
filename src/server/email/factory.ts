import type { ServerEnv } from "../env";
import type { EmailAdapter } from "./adapter";
import { MailpitEmailAdapter } from "./mailpit";
import { ResendEmailAdapter } from "./resend";

export function createEmailAdapter(env: ServerEnv, request?: typeof fetch): EmailAdapter {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("email_provider_not_configured");
    return new ResendEmailAdapter({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO, request });
  }
  if (!env.SMTP_HOST || !env.SMTP_PORT) throw new Error("email_provider_not_configured");
  return new MailpitEmailAdapter(env.SMTP_HOST, env.SMTP_PORT);
}
