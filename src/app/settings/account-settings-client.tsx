"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Brand } from "../onboarding/components";

type Preferences = { theme: "light" | "system" | "dark"; locale: string; timezone: string; version: number };
const defaults: Preferences = { theme: "light", locale: "en-CA", timezone: "America/Toronto", version: 0 };

function applyTheme(theme: Preferences["theme"]) {
  const effectiveTheme = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.accountTheme = effectiveTheme;
}

async function accountMutation(path: string, method: "PATCH" | "POST", body: unknown) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("csrf_unavailable");
  const { token } = await csrf.json() as { token: string };
  const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
  return { response, body: await response.json().catch(() => null) as { data?: unknown; code?: string } | null };
}

export function AccountSettingsClient({ initialName }: { initialName: string }) {
  const [preferences, setPreferences] = useState<Preferences>({ ...defaults, version: 0 });
  const [profileName, setProfileName] = useState(initialName);
  const [profileStatus, setProfileStatus] = useState("");
  const [preferencesStatus, setPreferencesStatus] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityStatus, setSecurityStatus] = useState("");

  useEffect(() => {
    fetch("/api/account/preferences", { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json() as { data?: { appearance: Preferences["theme"]; locale: string | null; timeZone: string | null; version: number } };
      if (!payload.data) return;
      const next = { theme: payload.data.appearance, locale: payload.data.locale ?? defaults.locale, timezone: payload.data.timeZone ?? defaults.timezone, version: payload.data.version };
      setPreferences(next); applyTheme(next.theme);
    }).catch(() => undefined);
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const value = profileName.trim();
    if (!value) return setProfileStatus("Enter the name you want to use in NexaFlow.");
    setProfileStatus("Saving profile…");
    try {
      const { response, body } = await accountMutation("/api/account/profile", "PATCH", { displayName: value });
      if (!response.ok || !body?.data || typeof body.data !== "object") throw new Error("profile_not_saved");
      const data = body.data as { displayName: string };
      setProfileName(data.displayName); setProfileStatus("Profile updated.");
    } catch { setProfileStatus("We couldn’t save your profile. Try again."); }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setPreferencesStatus("Saving preferences…");
    try {
      const { response, body } = await accountMutation("/api/account/preferences", "PATCH", { appearance: preferences.theme, locale: preferences.locale, timeZone: preferences.timezone, expectedVersion: preferences.version });
      if (!response.ok || !body?.data || typeof body.data !== "object") throw new Error("preferences_not_saved");
      const data = body.data as { appearance: Preferences["theme"]; locale: string | null; timeZone: string | null; version: number };
      const next = { theme: data.appearance, locale: data.locale ?? defaults.locale, timezone: data.timeZone ?? defaults.timezone, version: data.version };
      setPreferences(next); applyTheme(next.theme); setPreferencesStatus("Preferences updated.");
    } catch { setPreferencesStatus("We couldn’t save your preferences. Reload the latest settings and try again."); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return setSecurityStatus("New passwords do not match.");
    setSecurityStatus("Changing password…");
    try {
      const { response } = await accountMutation("/api/account/security/password", "POST", { currentPassword, newPassword });
      if (!response.ok) throw new Error("password_not_changed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.location.replace("/login?signedOut=1");
    } catch { setSecurityStatus("We couldn’t change your password. Confirm your current password and try again."); }
  }

  return <div className="account-shell">
    <header className="account-header"><Brand /><nav aria-label="Account navigation"><Link href="/crm">Back to CRM</Link></nav></header>
    <main className="account-content">
      <p className="eyebrow">Account</p>
      <h1>Personal settings</h1>
      <p className="lead">Manage your personal profile, display preferences, and account security. These settings do not change Workspace administration or your role.</p>

      <section className="account-section" aria-labelledby="profile-heading">
        <div><p className="eyebrow">Profile</p><h2 id="profile-heading">Your display name</h2><p>This is how NexaFlow will identify you in the product.</p></div>
        <form onSubmit={saveProfile} noValidate><label className="field"><span>Display name</span><input value={profileName} onChange={event => setProfileName(event.target.value)} maxLength={120} autoComplete="name" /></label><button className="primary">Save profile</button></form>
        {profileStatus && <p className="alert" role="status">{profileStatus}</p>}
      </section>

      <section className="account-section" aria-labelledby="preferences-heading">
        <div><p className="eyebrow">Preferences</p><h2 id="preferences-heading">Appearance and regional settings</h2><p>Choose how NexaFlow looks and formats information for you.</p></div>
        <form onSubmit={savePreferences} className="account-form-grid">
          <label className="field"><span>Theme</span><select value={preferences.theme} onChange={event => setPreferences(current => ({ ...current, theme: event.target.value as Preferences["theme"] }))}><option value="light">Light</option><option value="system">Use device setting</option><option value="dark">Dark</option></select></label>
          <label className="field"><span>Language and region</span><select value={preferences.locale} onChange={event => setPreferences(current => ({ ...current, locale: event.target.value }))}><option value="en-CA">English (Canada)</option><option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option></select></label>
          <label className="field"><span>Time zone</span><select value={preferences.timezone} onChange={event => setPreferences(current => ({ ...current, timezone: event.target.value }))}><option value="America/Toronto">Toronto (Eastern)</option><option value="America/Vancouver">Vancouver (Pacific)</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></label>
          <button className="primary">Save preferences</button>
        </form>
        {preferencesStatus && <p className="alert" role="status">{preferencesStatus}</p>}
      </section>

      <section className="account-section" aria-labelledby="security-heading">
        <div><p className="eyebrow">Account security</p><h2 id="security-heading">Change your password</h2><p>Confirm your identity before starting a password change. Password recovery completes the change and revokes existing sessions.</p></div>
        <form onSubmit={changePassword}><label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label className="field"><span>New password</span><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" required /></label><label className="field"><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><p>Changing your password signs you out of all devices. Sign in again to continue.</p><button className="primary">Change password</button><Link className="text-button" href="/forgot-password">I need account recovery</Link></form>
        {securityStatus && <p className="alert" role="status">{securityStatus}</p>}
      </section>
    </main>
  </div>;
}
