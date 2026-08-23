export const THEME_STORAGE_KEY = "nexaflow-theme";
export const THEME_CHANGE_EVENT = "nexaflow:theme-change";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

export function applyThemePreference(preference: ThemePreference) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, media.matches);
  root.style.colorScheme = root.dataset.theme;
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Storage can be unavailable. */ }
}

export function announceThemePreference(preference: ThemePreference) {
  applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: preference }));
}

export const themeBootstrapScript = `(() => {
  const root = document.documentElement;
  let preference = "system";
  try {
    const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (stored === "light" || stored === "dark" || stored === "system") preference = stored;
  } catch {}
  const resolved = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
})();`;
