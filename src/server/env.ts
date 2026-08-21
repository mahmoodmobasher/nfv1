import { z } from "zod";

function usesVerifiedSenderDomain(value: string): boolean {
  const sender = value.trim();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@mail\.nexaflowsystems\.com$/i.test(sender)
    || /^[^<>\r\n]+<[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@mail\.nexaflowsystems\.com>$/i.test(sender);
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]),
  SESSION_COOKIE_NAME: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  EMAIL_PROVIDER: z.enum(["smtp-local", "resend"]),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  RESEND_API_KEY: z.string().min(20).optional(),
  EMAIL_FROM: z.string().min(3).max(320).optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  APP_ORIGIN: z.string().url(),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive(),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive(),
  SESSION_TOUCH_INTERVAL_SECONDS: z.coerce.number().int().positive(),
  TRUSTED_PROXY_ENABLED: z.enum(["true", "false"]),
  TRUSTED_PROXY_SECRET: z.string().optional(),
  OIDC_FIXTURE_SECRET: z.string().min(32),
  OIDC_MODE: z.enum(["disabled", "fixture"]),
  OIDC_REDIRECT_URIS: z.string().min(1),
  INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  RECENT_AUTH_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Production database must not use a local address." });
  if (env.NODE_ENV === "production" && env.SESSION_SECRET.includes("local-only")) context.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Production session secret must be externally supplied." });
  if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://")) context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Production origin must use HTTPS." });
  if (env.EMAIL_PROVIDER === "smtp-local" && (!env.SMTP_HOST || !env.SMTP_PORT)) context.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "Local SMTP mode requires SMTP host and port." });
  if (env.EMAIL_PROVIDER === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "Resend mode requires an API key and sender." });
  if (env.EMAIL_PROVIDER === "resend" && env.EMAIL_FROM && !usesVerifiedSenderDomain(env.EMAIL_FROM)) context.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "Resend sender must use the verified mail.nexaflowsystems.com domain." });
  if (env.NODE_ENV === "production" && env.EMAIL_PROVIDER !== "resend") context.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "Production email delivery requires Resend." });
  if (env.NODE_ENV === "production" && env.RESEND_API_KEY?.toLowerCase().includes("placeholder")) context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "Production Resend API key must be externally supplied." });
  if (env.TRUSTED_PROXY_ENABLED === "true" && (!env.TRUSTED_PROXY_SECRET || env.TRUSTED_PROXY_SECRET.length < 32)) context.addIssue({ code: "custom", path: ["TRUSTED_PROXY_SECRET"], message: "Trusted proxy mode requires an internal secret." });
  if (env.NODE_ENV === "production" && env.OIDC_MODE === "fixture") context.addIssue({ code: "custom", path: ["OIDC_MODE"], message: "Fixture OIDC is forbidden in production." });
});

const localDefaults = {
  DATABASE_URL: "postgres://nexaflow:nexaflow@localhost:54329/nexaflow",
  NODE_ENV: "development",
  SESSION_COOKIE_NAME: "nexaflow_session",
  SESSION_SECRET: "local-only-session-secret-change-me-32chars",
  EMAIL_PROVIDER: "smtp-local",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  APP_ORIGIN: "http://127.0.0.1:3000",
  SESSION_IDLE_MINUTES: "30",
  SESSION_ABSOLUTE_HOURS: "24",
  SESSION_TOUCH_INTERVAL_SECONDS: "60",
  TRUSTED_PROXY_ENABLED: "false",
  OIDC_FIXTURE_SECRET: "local-oidc-fixture-secret-32-characters",
  OIDC_MODE: "fixture",
  OIDC_REDIRECT_URIS: "http://127.0.0.1:3000/api/auth/oidc/callback,http://127.0.0.1:3000/api/auth/recent/oidc/callback",
  INVITATION_TTL_HOURS: "168",
  RECENT_AUTH_MINUTES: "10",
} as const;

export type ServerEnv = z.infer<typeof schema>;
export function getServerEnv(input: Record<string, string | undefined> = process.env): ServerEnv {
  return schema.parse(input.NODE_ENV === "production" ? input : { ...localDefaults, ...input });
}
