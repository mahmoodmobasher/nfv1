import type { EmailAdapter, EmailMessage } from "./adapter";

type ResendConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
  request?: typeof fetch;
};

type ResendResponse = { id?: unknown };

export class ResendEmailAdapter implements EmailAdapter {
  private readonly request: typeof fetch;

  constructor(private readonly config: ResendConfig) {
    this.request = config.request ?? fetch;
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      "content-type": "application/json",
    };
    if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;

    let response: Response;
    try {
      response = await this.request("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("delivery_unavailable");
    }

    if (!response.ok) {
      throw new Error(response.status === 429 || response.status >= 500 ? "delivery_unavailable" : "delivery_rejected");
    }

    const payload = await response.json().catch(() => null) as ResendResponse | null;
    if (typeof payload?.id !== "string" || !payload.id) throw new Error("delivery_unavailable");
    return { messageId: payload.id };
  }
}
