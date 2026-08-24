import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getServerEnv } from "@/server/env";
import { localDatabase, sessionToken } from "@/server/http";
import { resolveIdentityContext } from "@/server/security/session";
import { accountPreferences } from "@/server/account/service";
import { TitleUpdater } from "./onboarding/title-updater";
import { isThemePreference, themeBootstrapScript, type ThemePreference } from "./theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NexaFlow | Connected B2B Sales & Delivery CRM",
  description: "Connect sales, customer communication, and post-sale delivery in one practical workspace with optional, human-approved AI assistance.",
};

async function authenticatedTheme(requestHeaders: Headers): Promise<ThemePreference> {
  const { pool } = localDatabase();
  try {
    const env = getServerEnv();
    const request = new Request(env.APP_ORIGIN, { headers: requestHeaders });
    const identity = await resolveIdentityContext(pool, sessionToken(request), env.SESSION_SECRET, new Date(), {
      idleMinutes: env.SESSION_IDLE_MINUTES,
      touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS,
    });
    if (!identity) return "system";
    const preference = (await accountPreferences(pool, identity)).appearance;
    return isThemePreference(preference) ? preference : "system";
  } catch {
    return "system";
  } finally {
    await pool.end();
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = new Headers(await headers());
  const preference = await authenticatedTheme(requestHeaders);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme={preference === "dark" ? "dark" : "light"} data-theme-preference={preference} suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}><Script id="nexaflow-theme" strategy="beforeInteractive" nonce={nonce}>{themeBootstrapScript}</Script><TitleUpdater/><Suspense fallback={<div className="route-loading" role="status">Loading NexaFlow…</div>}>{children}</Suspense></body>
    </html>
  );
}
