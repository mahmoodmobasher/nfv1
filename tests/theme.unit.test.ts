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
    expect(contrast("#34433e", "#f6f8f7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#62716b", "#f6f8f7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#d1ddd8", "#0b1210")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#9fb0aa", "#0b1210")).toBeGreaterThanOrEqual(4.5);
  });

  it("meets WCAG AA contrast for every primary action state in both themes", () => {
    const foreground = "#13201c";
    for (const fill of ["#e75c35", "#f07955", "#f58a69", "#ff8e6b", "#f79b7e"]) {
      expect(contrast(foreground, fill), fill).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#34433e", "#f0f4f2")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#d1ddd8", "#17241f")).toBeGreaterThanOrEqual(4.5);
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
});
