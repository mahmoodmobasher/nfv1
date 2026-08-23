"use client";

import { useEffect } from "react";

export function AccountThemeSync() {
  useEffect(() => {
    fetch("/api/account/preferences", { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ data?: { appearance?: "system" | "light" | "dark" } }> : null)
      .then(payload => {
        const appearance = payload?.data?.appearance;
        if (!appearance) return;
        document.documentElement.dataset.accountTheme = appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : appearance;
      })
      .catch(() => undefined);
  }, []);
  return null;
}
