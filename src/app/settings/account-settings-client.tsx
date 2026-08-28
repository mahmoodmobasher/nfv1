"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { announceThemePreference } from "../theme";
import { Button } from "@/frontend/design-system";

type Preferences = {
  theme: "light" | "system" | "dark";
  locale: string;
  timezone: string;
  version: number;
};
const defaults: Preferences = {
  theme: "light",
  locale: "en-CA",
  timezone: "America/Toronto",
  version: 0,
};

async function accountMutation(
  path: string,
  method: "PATCH" | "POST",
  body: unknown,
) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("csrf_unavailable");
  const { token } = (await csrf.json()) as { token: string };
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json().catch(() => null)) as {
      data?: unknown;
      code?: string;
    } | null,
  };
}

export function AccountSettingsClient({
  initialName,
  initialPreferences,
}: {
  initialName: string;
  initialPreferences: Preferences;
}) {
  const [preferences, setPreferences] =
    useState<Preferences>(initialPreferences);
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
    if (!value)
      return setProfileStatus("Enter the name you want to use in NexaFlow.");
    setProfileStatus("Saving profile…");
    try {
      const { response, body } = await accountMutation(
        "/api/account/profile",
        "PATCH",
        { displayName: value },
      );
      if (!response.ok || !body?.data || typeof body.data !== "object")
        throw new Error("profile_not_saved");
      const data = body.data as { displayName: string };
      setProfileName(data.displayName);
      setProfileStatus("Profile updated.");
    } catch {
      setProfileStatus("We couldn’t save your profile. Try again.");
    }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setPreferencesStatus("Saving preferences…");
    try {
      const { response, body } = await accountMutation(
        "/api/account/preferences",
        "PATCH",
        {
          appearance: preferences.theme,
          locale: preferences.locale,
          timeZone: preferences.timezone,
          expectedVersion: preferences.version,
        },
      );
      if (!response.ok || !body?.data || typeof body.data !== "object")
        throw new Error("preferences_not_saved");
      const data = body.data as {
        appearance: Preferences["theme"];
        locale: string | null;
        timeZone: string | null;
        version: number;
      };
      const next = {
        theme: data.appearance,
        locale: data.locale ?? defaults.locale,
        timezone: data.timeZone ?? defaults.timezone,
        version: data.version,
      };
      confirmedPreferences.current = next;
      setPreferences(next);
      announceThemePreference(next.theme, true);
      setPreferencesStatus("Preferences updated.");
    } catch {
      const confirmed = confirmedPreferences.current;
      setPreferences(confirmed);
      announceThemePreference(confirmed.theme, true);
      setPreferencesStatus(
        "We couldn’t save your preferences. Your last saved theme has been restored.",
      );
    }
  }

  function reloadPreferences() {
    setPreferencesStatus("Loading latest preferences…");
    fetch("/api/account/preferences", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: {
            appearance: Preferences["theme"];
            locale: string | null;
            timeZone: string | null;
            version: number;
          };
        };
        if (!response.ok || !payload.data) throw new Error("reload_failed");
        const next = {
          theme: payload.data.appearance,
          locale: payload.data.locale ?? defaults.locale,
          timezone: payload.data.timeZone ?? defaults.timezone,
          version: payload.data.version,
        };
        confirmedPreferences.current = next;
        setPreferences(next);
        announceThemePreference(next.theme, true);
        setPreferencesStatus("Latest preferences loaded.");
      })
      .catch(() =>
        setPreferencesStatus(
          "We couldn’t load the latest preferences. Try again.",
        ),
      );
  }

  async function reauthenticate(event: FormEvent) {
    event.preventDefault();
    setSecurityStatus("Confirming your identity…");
    try {
      const { response } = await accountMutation(
        "/api/auth/recent/password",
        "POST",
        { password: currentPassword },
      );
      if (!response.ok) throw new Error("reauth_failed");
      setCurrentPassword("");
      setNeedsReauth(false);
      setSecurityStatus(
        "Identity confirmed. Enter your passwords again to continue.",
      );
    } catch {
      setSecurityStatus(
        "We couldn’t confirm your identity. Check your password and try again.",
      );
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (
      newPassword.length < 12 ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setFieldError("Use 12–256 characters, including a number and a symbol.");
      requestAnimationFrame(() => passwordErrorRef.current?.focus());
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("New passwords do not match.");
      requestAnimationFrame(() => passwordErrorRef.current?.focus());
      return;
    }
    setFieldError("");
    setSecurityStatus("Changing password…");
    try {
      const { response, body } = await accountMutation(
        "/api/account/security/password",
        "POST",
        { currentPassword, newPassword },
      );
      if (!response.ok && body?.code === "recent_auth_required") {
        setNeedsReauth(true);
        setNewPassword("");
        setConfirmPassword("");
        setSecurityStatus(
          "Confirm your identity to continue changing your password.",
        );
        return;
      }
      if (!response.ok) throw new Error("password_not_changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.location.replace("/login?signedOut=1");
    } catch {
      setSecurityStatus(
        "We couldn’t change your password. Confirm your current password and try again.",
      );
    }
  }

  return (
    <section className="mx-auto grid max-w-4xl gap-5 px-5 py-8">
      <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
        Account
      </p>
      <h1>Personal settings</h1>
      <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
        Manage your personal profile, display preferences, and account security.
        These settings do not change Workspace administration or your role.
      </p>

      <section
        className="grid gap-4 rounded-panel border border-line bg-surface p-5"
        aria-labelledby="profile-heading"
      >
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
            Profile
          </p>
          <h2 id="profile-heading">Your display name</h2>
          <p>This is how NexaFlow will identify you in the product.</p>
        </div>
        <form onSubmit={saveProfile} noValidate>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
            <span>Display name</span>
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <Button variant="primary" className="disabled:opacity-45">
            Save profile
          </Button>
        </form>
        {profileStatus && (
          <p
            className="my-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
            role="status"
          >
            {profileStatus}
          </p>
        )}
      </section>

      <section
        className="grid gap-4 rounded-panel border border-line bg-surface p-5"
        aria-labelledby="preferences-heading"
      >
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
            Preferences
          </p>
          <h2 id="preferences-heading">Appearance and regional settings</h2>
          <p>Choose how NexaFlow looks and formats information for you.</p>
        </div>
        <form onSubmit={savePreferences} className="grid gap-4 md:grid-cols-2">
          <p
            className="my-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
            role="note"
          >
            NexaFlow now uses one shared responsive presentation. Previous
            interface-style and Workspace-layout choices are retained only as
            compatibility data and no longer change the application.
          </p>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
            <span>Theme</span>
            <select
              value={preferences.theme}
              onChange={(event) => {
                const theme = event.target.value as Preferences["theme"];
                setPreferences((current) => ({ ...current, theme }));
                announceThemePreference(theme);
              }}
            >
              <option value="light">Light</option>
              <option value="system">Use device setting</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
            <span>Language and region</span>
            <select
              value={preferences.locale}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  locale: event.target.value,
                }))
              }
            >
              <option value="en-CA">English (Canada)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
            <span>Time zone</span>
            <select
              value={preferences.timezone}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
            >
              <option value="America/Toronto">Toronto (Eastern)</option>
              <option value="America/Vancouver">Vancouver (Pacific)</option>
              <option value="Europe/London">London</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <Button variant="primary" className="disabled:opacity-45">
            Save preferences
          </Button>
        </form>
        {preferencesStatus && (
          <>
            <p
              className="my-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
              role="status"
            >
              {preferencesStatus}
            </p>
            <Button
              variant="secondary"
              className="disabled:opacity-45"
              type="button"
              onClick={reloadPreferences}
            >
              Reload latest
            </Button>
          </>
        )}
      </section>

      <section
        className="grid gap-4 rounded-panel border border-line bg-surface p-5"
        aria-labelledby="security-heading"
      >
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
            Account security
          </p>
          <h2 id="security-heading">Change your password</h2>
          <p>
            Confirm your identity before starting a password change. Password
            recovery completes the change and revokes existing sessions.
          </p>
        </div>
        {needsReauth ? (
          <form onSubmit={reauthenticate}>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>Confirm your current password</span>
              <input
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <Button
              variant="secondary"
              className="disabled:opacity-45"
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
            >
              {showPasswords ? "Hide password" : "Show password"}
            </Button>
            <Button variant="primary" className="disabled:opacity-45">
              Confirm identity
            </Button>
          </form>
        ) : (
          <form onSubmit={changePassword}>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>Current password</span>
              <input
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>New password</span>
              <small id="password-policy">
                Use 12–256 characters, including a number and a symbol.
              </small>
              <input
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(fieldError)}
                aria-describedby={`password-policy${fieldError ? " password-error" : ""}`}
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>Confirm new password</span>
              <input
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "password-error" : undefined}
              />
            </label>
            <Button
              variant="secondary"
              className="disabled:opacity-45"
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
            >
              {showPasswords ? "Hide passwords" : "Show passwords"}
            </Button>
            {fieldError && (
              <p
                ref={passwordErrorRef}
                id="password-error"
                className="my-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink border-danger/30 bg-danger-soft text-danger"
                role="alert"
                tabIndex={-1}
              >
                {fieldError}
              </p>
            )}
            <p>
              Changing your password signs you out of all devices. Sign in again
              to continue.
            </p>
            <Button variant="primary" className="disabled:opacity-45">
              Change password
            </Button>
            <Link
              className="inline-flex min-h-11 items-center border-0 bg-transparent px-2 font-semibold text-accent-ink"
              href="/forgot-password"
            >
              I need account recovery
            </Link>
          </form>
        )}
        {securityStatus && (
          <p
            className="my-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
            role={
              needsReauth || securityStatus.includes("couldn’t")
                ? "alert"
                : "status"
            }
          >
            {securityStatus}
          </p>
        )}
      </section>
    </section>
  );
}
