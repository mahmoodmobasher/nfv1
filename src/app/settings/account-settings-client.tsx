"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { announceThemePreference } from "../theme";

type Preferences = { theme: "light" | "system" | "dark"; locale: string; timezone: string; version: number };
const defaults: Preferences = { theme: "light", locale: "en-CA", timezone: "America/Toronto", version: 0 };

async function accountMutation(path: string, method: "PATCH" | "POST", body: unknown) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("csrf_unavailable");
  const { token } = await csrf.json() as { token: string };
  const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
  return { response, body: await response.json().catch(() => null) as { data?: unknown; code?: string } | null };
}

export function AccountSettingsClient({ initialName, initialPreferences }: { initialName: string; initialPreferences: Preferences }) {
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
  const confirmedPreferences = useRef<Preferences>(initialPreferences);
  const [profileName, setProfileName] = useState(initialName);
  const [profileStatus, setProfileStatus] = useState("");
  const [preferencesStatus, setPreferencesStatus] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityStatus, setSecurityStatus] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const passwordErrorRef = useRef<HTMLParagraphElement>(null);

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
      confirmedPreferences.current = next; setPreferences(next); announceThemePreference(next.theme, true); setPreferencesStatus("Preferences updated.");
    } catch {
      const confirmed = confirmedPreferences.current;
      setPreferences(confirmed); announceThemePreference(confirmed.theme, true);
      setPreferencesStatus("We couldn’t save your preferences. Your last saved theme has been restored.");
    }
  }

  function reloadPreferences() {
    setPreferencesStatus("Loading latest preferences…");
    fetch("/api/account/preferences", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as { data?: { appearance: Preferences["theme"]; locale: string | null; timeZone: string | null; version: number } };
      if (!response.ok || !payload.data) throw new Error("reload_failed");
      const next = { theme: payload.data.appearance, locale: payload.data.locale ?? defaults.locale, timezone: payload.data.timeZone ?? defaults.timezone, version: payload.data.version };
      confirmedPreferences.current = next; setPreferences(next); announceThemePreference(next.theme, true); setPreferencesStatus("Latest preferences loaded.");
    }).catch(() => setPreferencesStatus("We couldn’t load the latest preferences. Try again."));
  }

  async function reauthenticate(event: FormEvent) {
    event.preventDefault();
    setSecurityStatus("Confirming your identity…");
    try {
      const { response } = await accountMutation("/api/auth/recent/password", "POST", { password: currentPassword });
      if (!response.ok) throw new Error("reauth_failed");
      setCurrentPassword(""); setNeedsReauth(false); setSecurityStatus("Identity confirmed. Enter your passwords again to continue.");
    } catch { setSecurityStatus("We couldn’t confirm your identity. Check your password and try again."); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12 || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) { setFieldError("Use 12–256 characters, including a number and a symbol."); requestAnimationFrame(() => passwordErrorRef.current?.focus()); return; }
    if (newPassword !== confirmPassword) { setFieldError("New passwords do not match."); requestAnimationFrame(() => passwordErrorRef.current?.focus()); return; }
    setFieldError("");
    setSecurityStatus("Changing password…");
    try {
      const { response, body } = await accountMutation("/api/account/security/password", "POST", { currentPassword, newPassword });
      if (!response.ok && body?.code === "recent_auth_required") { setNeedsReauth(true); setNewPassword(""); setConfirmPassword(""); setSecurityStatus("Confirm your identity to continue changing your password."); return; }
      if (!response.ok) throw new Error("password_not_changed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.location.replace("/login?signedOut=1");
    } catch { setSecurityStatus("We couldn’t change your password. Confirm your current password and try again."); }
  }

  return <section className="account-content">
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
          <label className="field"><span>Theme</span><select value={preferences.theme} onChange={event => { const theme = event.target.value as Preferences["theme"]; setPreferences(current => ({ ...current, theme })); announceThemePreference(theme); }}><option value="light">Light</option><option value="system">Use device setting</option><option value="dark">Dark</option></select></label>
          <label className="field"><span>Language and region</span><select value={preferences.locale} onChange={event => setPreferences(current => ({ ...current, locale: event.target.value }))}><option value="en-CA">English (Canada)</option><option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option></select></label>
          <label className="field"><span>Time zone</span><select value={preferences.timezone} onChange={event => setPreferences(current => ({ ...current, timezone: event.target.value }))}><option value="America/Toronto">Toronto (Eastern)</option><option value="America/Vancouver">Vancouver (Pacific)</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></label>
          <button className="primary">Save preferences</button>
        </form>
        {preferencesStatus && <><p className="alert" role="status">{preferencesStatus}</p><button className="secondary" type="button" onClick={reloadPreferences}>Reload latest</button></>}
      </section>

      <section className="account-section" aria-labelledby="security-heading">
        <div><p className="eyebrow">Account security</p><h2 id="security-heading">Change your password</h2><p>Confirm your identity before starting a password change. Password recovery completes the change and revokes existing sessions.</p></div>
        {needsReauth ? <form onSubmit={reauthenticate}><label className="field"><span>Confirm your current password</span><input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><button className="secondary" type="button" onClick={() => setShowPasswords(value => !value)}>{showPasswords ? "Hide password" : "Show password"}</button><button className="primary">Confirm identity</button></form> : <form onSubmit={changePassword}><label className="field"><span>Current password</span><input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label className="field"><span>New password</span><small id="password-policy">Use 12–256 characters, including a number and a symbol.</small><input type={showPasswords ? "text" : "password"} value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" required aria-invalid={Boolean(fieldError)} aria-describedby={`password-policy${fieldError ? " password-error" : ""}`} /></label><label className="field"><span>Confirm new password</span><input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "password-error" : undefined} /></label><button className="secondary" type="button" onClick={() => setShowPasswords(value => !value)}>{showPasswords ? "Hide passwords" : "Show passwords"}</button>{fieldError && <p ref={passwordErrorRef} id="password-error" className="alert error" role="alert" tabIndex={-1}>{fieldError}</p>}<p>Changing your password signs you out of all devices. Sign in again to continue.</p><button className="primary">Change password</button><Link className="text-button" href="/forgot-password">I need account recovery</Link></form>}
        {securityStatus && <p className="alert" role={needsReauth || securityStatus.includes("couldn’t") ? "alert" : "status"}>{securityStatus}</p>}
      </section>
    </section>;
}
