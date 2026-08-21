export type EmailMessage = { to: string; subject: string; text: string; idempotencyKey?: string };
export interface EmailAdapter { send(message: EmailMessage): Promise<{ messageId: string }> }
