import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceWorkspaceLayoutPreference,
  applyWorkspaceLayoutPreference,
  isWorkspaceLayoutPreference,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  workspaceLayoutBootstrapScript,
} from "../src/app/workspace-layout";

afterEach(() => vi.unstubAllGlobals());

function bootstrap(stored: string | null, throws = false) {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  const localStorage = { getItem: (key: string) => {
    expect(key).toBe(WORKSPACE_LAYOUT_STORAGE_KEY);
    if (throws) throw new Error("storage unavailable");
    return stored;
  } };
  new Function("document", "localStorage", workspaceLayoutBootstrapScript)(document, localStorage);
  return document.documentElement.dataset.workspaceLayout;
}

describe("workspace layout presentation preference", () => {
  it("accepts only the two shared presentation modes", () => {
    expect(isWorkspaceLayoutPreference("structured")).toBe(true);
    expect(isWorkspaceLayoutPreference("command-center")).toBe(true);
    expect(isWorkspaceLayoutPreference("dense")).toBe(false);
    expect(isWorkspaceLayoutPreference(null)).toBe(false);
  });

  it("applies a valid saved mode before paint", () => {
    expect(bootstrap("command-center")).toBe("command-center");
    expect(workspaceLayoutBootstrapScript).toContain("root.dataset.workspaceLayout");
  });

  it("falls back safely for missing, invalid, or unavailable storage", () => {
    expect(bootstrap(null)).toBe("structured");
    expect(bootstrap("unknown-layout")).toBe("structured");
    expect(bootstrap(null, true)).toBe("structured");
  });

  it("switches immediately, persists only the presentation value, and announces the change", () => {
    const dataset: Record<string, string> = {};
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("window", { localStorage: { setItem }, dispatchEvent });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: unknown) {} });
    applyWorkspaceLayoutPreference("command-center", true);
    expect(dataset.workspaceLayout).toBe("command-center");
    expect(setItem).toHaveBeenCalledWith(WORKSPACE_LAYOUT_STORAGE_KEY, "command-center");
    announceWorkspaceLayoutPreference("structured");
    expect(dataset.workspaceLayout).toBe("structured");
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
