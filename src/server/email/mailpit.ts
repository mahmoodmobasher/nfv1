import nodemailer from "nodemailer";
import type { EmailAdapter, EmailMessage } from "./adapter";

export class MailpitEmailAdapter implements EmailAdapter {
  constructor(private readonly host: string, private readonly port: number) {}
  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const transport = nodemailer.createTransport({ host: this.host, port: this.port, secure: false });
    const { idempotencyKey, ...content } = message;
    const result = await transport.sendMail({ from: "NexaFlow Local <noreply@nexaflow.local>", ...content, headers: idempotencyKey ? { "X-NexaFlow-Idempotency-Key": idempotencyKey } : undefined });
    return { messageId: result.messageId };
  }
}
