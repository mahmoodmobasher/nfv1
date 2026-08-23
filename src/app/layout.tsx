import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { TitleUpdater } from "./onboarding/title-updater";
import { themeBootstrapScript } from "./theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexaFlow | Connected B2B Sales & Delivery CRM",
  description: "Connect sales, customer communication, and post-sale delivery in one practical workspace with optional, human-approved AI assistance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" data-theme-preference="system" suppressHydrationWarning>
      <body className="antialiased"><Script id="nexaflow-theme" strategy="beforeInteractive">{themeBootstrapScript}</Script><TitleUpdater/><Suspense fallback={<div className="route-loading" role="status">Loading NexaFlow…</div>}>{children}</Suspense></body>
    </html>
  );
}
