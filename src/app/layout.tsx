import type { Metadata } from "next";
import { Suspense } from "react";
import { TitleUpdater } from "./onboarding/title-updater";
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
    <html lang="en">
      <body className="antialiased"><TitleUpdater/><Suspense fallback={<div className="route-loading" role="status">Loading NexaFlow…</div>}>{children}</Suspense></body>
    </html>
  );
}
