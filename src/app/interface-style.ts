export const INTERFACE_STYLE_STORAGE_KEY = "nexaflow-interface-style";
export const INTERFACE_STYLE_CHANGE_EVENT = "nexaflow:interface-style-change";

export type InterfaceStylePreference = "spectrum" | "nexa-crm";

export function isInterfaceStylePreference(value: unknown): value is InterfaceStylePreference {
  return value === "spectrum" || value === "nexa-crm";
}

export function applyInterfaceStylePreference(preference: InterfaceStylePreference, persist = false) {
  document.documentElement.dataset.interfaceStyle = preference;
  if (persist) try { window.localStorage.setItem(INTERFACE_STYLE_STORAGE_KEY, preference); } catch { /* Storage can be unavailable. */ }
}

export function announceInterfaceStylePreference(preference: InterfaceStylePreference, persist = false) {
  applyInterfaceStylePreference(preference, persist);
  window.dispatchEvent(new CustomEvent<InterfaceStylePreference>(INTERFACE_STYLE_CHANGE_EVENT, { detail: preference }));
}

export const interfaceStyleBootstrapScript = `(() => {
  const root = document.documentElement;
  let value = "spectrum";
  try { value = localStorage.getItem("${INTERFACE_STYLE_STORAGE_KEY}") || "spectrum"; } catch {}
  root.dataset.interfaceStyle = value === "nexa-crm" ? "nexa-crm" : "spectrum";
})();`;
