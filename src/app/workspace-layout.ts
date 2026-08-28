export const WORKSPACE_LAYOUT_STORAGE_KEY = "nexaflow-workspace-layout";
export const WORKSPACE_LAYOUT_CHANGE_EVENT = "nexaflow:workspace-layout-change";

export type WorkspaceLayoutPreference = "structured" | "command-center";

export function isWorkspaceLayoutPreference(value: unknown): value is WorkspaceLayoutPreference {
  return value === "structured" || value === "command-center";
}

export function applyWorkspaceLayoutPreference(preference: WorkspaceLayoutPreference, persist = false) {
  document.documentElement.dataset.workspaceLayout = preference;
  if (persist) try { window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, preference); } catch { /* Storage can be unavailable. */ }
}

export function announceWorkspaceLayoutPreference(preference: WorkspaceLayoutPreference, persist = false) {
  applyWorkspaceLayoutPreference(preference, persist);
  window.dispatchEvent(new CustomEvent<WorkspaceLayoutPreference>(WORKSPACE_LAYOUT_CHANGE_EVENT, { detail: preference }));
}

export const workspaceLayoutBootstrapScript = `(() => {
  const root = document.documentElement;
  let value = "structured";
  try { value = localStorage.getItem("${WORKSPACE_LAYOUT_STORAGE_KEY}") || "structured"; } catch {}
  root.dataset.workspaceLayout = value === "command-center" ? "command-center" : "structured";
})();`;
