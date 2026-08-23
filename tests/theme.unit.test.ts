import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme, themeBootstrapScript } from "../src/app/theme";

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
    expect(themeBootstrapScript).toContain('localStorage.getItem("nexaflow-theme")');
    expect(themeBootstrapScript).toContain("prefers-color-scheme: dark");
    expect(themeBootstrapScript).toContain("root.dataset.theme = resolved");
  });

  it("meets WCAG AA contrast for foundation body and muted text", () => {
    expect(contrast("#34433e", "#f6f8f7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#62716b", "#f6f8f7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#d1ddd8", "#0b1210")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#9fb0aa", "#0b1210")).toBeGreaterThanOrEqual(4.5);
  });
});
