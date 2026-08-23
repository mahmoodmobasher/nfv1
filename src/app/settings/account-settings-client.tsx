"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Brand } from "../onboarding/components";
import { securePost } from "../onboarding/api";

type Preferences = { theme: "light" | "system" | "dark"; locale: string; timezone: string };
const preferenceKey = "nexaflow-personal-settings-preview";
const defaults: Preferences = { theme: "light", locale: "en-CA", timezone: "America/Toronto" };

function applyTheme(theme: Preferences["theme"]) {
  const effectiveTheme = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.accountTheme = effectiveTheme;
}

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceKey) ?? "null") as Partial<Preferences> | null;
    return { ...defaults, ...saved };
  } catch { return defaults; }
}

export function AccountSettingsClient({ initialName, email }: { initialName: string; email: string }) {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [profileName, setProfileName] = useState(initialName);
  const [profileStatus, setProfileStatus] = useState("");
  const [preferencesStatus, setPreferencesStatus] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const [securityStatus, setSecurityStatus] = useState("");

  useEffect(() => {
    const saved = loadPreferences();
    setPreferences(saved);
    applyTheme(saved.theme);
  }, []);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    const value = profileName.trim();
    if (!value) return setProfileStatus("Enter the name you want to use in NexaFlow.");
    // Integration seam: the existing identity API has no authenticated profile-update endpoint.
    setProfileStatus("Profile updates are ready for the account API. No profile change was saved.");
  }

  function savePreferences(event: FormEvent) {
    event.preventDefault();
    window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    applyTheme(preferences.theme);
    setPreferencesStatus("Preferences saved for this browser. Server-synced preferences will replace this local setting.");
  }

  async function confirmIdentity(event: FormEvent) {
    event.preventDefault();
    setSecurityStatus("Confirming your identity…");
    try {
      const { response } = await securePost("/api/auth/recent/password", { password: currentPassword });
      if (!response.ok) return setSecurityStatus("We couldn’t confirm your identity. Check your password and try again.");
      setCurrentPassword("");
      setReauthenticated(true);
      setSecurityStatus("Identity confirmed. Continue with the secure recovery flow.");
    } catch { setSecurityStatus("We couldn’t confirm your identity. Try again."); }
  }

  async function requestRecovery(event: FormEvent) {
    event.preventDefault();
    setSecurityStatus("Sending a secure recovery link…");
    try {
      const { response } = await securePost("/api/auth/reset-request", { email });
      if (!response.ok) throw new Error("recovery_unavailable");
      setSecurityStatus("Check your email for a recovery link. It securely completes the password change and revokes existing sessions.");
    } catch { setSecurityStatus("We couldn’t start account recovery. Use the recovery page to try again."); }
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
        {!reauthenticated ? <form onSubmit={confirmIdentity}><label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><button className="primary">Confirm identity</button><Link className="text-button" href="/forgot-password">I need account recovery</Link></form> : <form onSubmit={requestRecovery}><p>You’re confirmed. For this phase, password changes use the existing secure recovery link rather than a new direct-change API.</p><button className="primary">Send secure recovery link</button><Link className="text-button" href="/forgot-password">Use the recovery page instead</Link></form>}
        {securityStatus && <p className="alert" role="status">{securityStatus}</p>}
      </section>
    </main>
  </div>;
}
