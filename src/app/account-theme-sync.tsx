"use client";

import { useEffect } from "react";
import { applyThemePreference, isThemePreference, THEME_CHANGE_EVENT, type ThemePreference } from "./theme";

export function AccountThemeSync() {
  useEffect(() => {
    let preference: ThemePreference = isThemePreference(document.documentElement.dataset.themePreference)
      ? document.documentElement.dataset.themePreference
      : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => { if (preference === "system") applyThemePreference(preference); };
    const followApp = (event: Event) => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (!isThemePreference(next)) return;
      preference = next;
      applyThemePreference(preference);
    };
    media.addEventListener("change", followSystem);
    window.addEventListener(THEME_CHANGE_EVENT, followApp);
    fetch("/api/account/preferences", { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ data?: { appearance?: "system" | "light" | "dark" } }> : null)
      .then(payload => {
        const appearance = payload?.data?.appearance;
        if (!isThemePreference(appearance)) return;
        preference = appearance;
        applyThemePreference(preference);
      })
      .catch(() => undefined);
    return () => {
      media.removeEventListener("change", followSystem);
      window.removeEventListener(THEME_CHANGE_EVENT, followApp);
    };
  }, []);
  return null;
}
