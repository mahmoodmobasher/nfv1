"use client";

import { useEffect } from "react";
import { applyThemePreference, isThemePreference, THEME_CHANGE_EVENT, updateSystemSubscription, type ThemePreference } from "./theme";

export function AccountThemeSync({ reconcile = true }: { reconcile?: boolean }) {
  useEffect(() => {
    let preference: ThemePreference = isThemePreference(document.documentElement.dataset.themePreference)
      ? document.documentElement.dataset.themePreference
      : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let subscribed = false;
    const followSystem = () => { if (preference === "system") applyThemePreference(preference); };
    const followApp = (event: Event) => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (!isThemePreference(next)) return;
      preference = next;
      applyThemePreference(preference);
      subscribed = updateSystemSubscription(preference, media, followSystem, subscribed);
    };
    subscribed = updateSystemSubscription(preference, media, followSystem, subscribed);
    window.addEventListener(THEME_CHANGE_EVENT, followApp);
    if (reconcile) fetch("/api/account/preferences", { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ data?: { appearance?: "system" | "light" | "dark" } }> : null)
      .then(payload => {
        const appearance = payload?.data?.appearance;
        if (!isThemePreference(appearance)) return;
        preference = appearance;
        applyThemePreference(preference, true);
        subscribed = updateSystemSubscription(preference, media, followSystem, subscribed);
      })
      .catch(() => undefined);
    return () => {
      if (subscribed) media.removeEventListener("change", followSystem);
      window.removeEventListener(THEME_CHANGE_EVENT, followApp);
    };
  }, [reconcile]);
  return null;
}
