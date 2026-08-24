import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme, themeBootstrapScript, updateSystemSubscription } from "../src/app/theme";
import { contentSecurityPolicy } from "../src/proxy";

function luminance(hex: string) {
  const values = hex.match(/[a-f\d]{2}/gi)!.map(value => Number.parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + .05) / (darker + .05);
}

describe("theme foundation", () => {
  it("resolves explicit and system preferences", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("accepts only supported persisted preferences", () => {
    expect(["light", "dark", "system"].every(isThemePreference)).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("keeps the pre-paint bootstrap fixed and free of user interpolation", () => {
    expect(themeBootstrapScript).not.toContain("localStorage");
    expect(themeBootstrapScript).toContain("root.dataset.themePreference");
    expect(themeBootstrapScript).toContain("prefers-color-scheme: dark");
    expect(themeBootstrapScript).toContain("root.dataset.theme = resolved");
  });

  it("meets WCAG AA contrast for foundation body and muted text", () => {
    expect(contrast("#35414d", "#f7f8fa")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#4b5866", "#f7f8fa")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#d6dde4", "#0b1118")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#a7b1bc", "#0b1118")).toBeGreaterThanOrEqual(4.5);
  });

  it("meets WCAG AA contrast for every primary action state in both themes", () => {
    for (const fill of ["#315ed4", "#294baa", "#263f86"]) expect(contrast("#ffffff", fill), fill).toBeGreaterThanOrEqual(4.5);
    for (const fill of ["#6c94f7", "#89aaff", "#a7c0ff"]) expect(contrast("#0b1118", fill), fill).toBeGreaterThanOrEqual(4.5);
  });

  it("subscribes only in System mode without duplicates and cleans up", () => {
    const calls: string[] = [];
    const media = {
      matches: false,
      addEventListener: () => calls.push("add"),
      removeEventListener: () => calls.push("remove"),
    };
    const listener = () => undefined;
    let subscribed = updateSystemSubscription("light", media, listener, false);
    expect(subscribed).toBe(false);
    subscribed = updateSystemSubscription("system", media, listener, subscribed);
    subscribed = updateSystemSubscription("system", media, listener, subscribed);
    subscribed = updateSystemSubscription("dark", media, listener, subscribed);
    expect(subscribed).toBe(false);
    expect(calls).toEqual(["add", "remove"]);
  });

  it("emits a nonce-bound CSP without unsafe-inline", () => {
    const policy = contentSecurityPolicy("fixed-nonce", false);
    expect(policy).toContain("script-src 'self' 'nonce-fixed-nonce' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("keeps desktop Workspace navigation states at WCAG AA contrast", () => {
    const lightSurface = "#ffffff";
    const darkSurface = "#0e171f";
    for (const color of ["#35414d", "#294baa", "#4b5866"]) expect(contrast(color, lightSurface), color).toBeGreaterThanOrEqual(4.5);
    for (const color of ["#d6dde4", "#a7c0ff", "#a7b1bc"]) expect(contrast(color, darkSurface), color).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps Pipeline stage, card, count, and metadata text at WCAG AA contrast", () => {
    const themes = [
      { stage: "#f0f2f5", card: "#ffffff", raised: "#ffffff", strong: "#17212b", text: "#35414d", muted: "#4b5866" },
      { stage: "#17232e", card: "#111a23", raised: "#1d2a36", strong: "#f4f7fa", text: "#d6dde4", muted: "#a7b1bc" },
    ];
    for (const theme of themes) {
      expect(contrast(theme.strong, theme.stage)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, theme.stage)).toBeGreaterThanOrEqual(4.5);
      for (const surface of [theme.card, theme.raised]) {
        expect(contrast(theme.strong, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.muted, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
