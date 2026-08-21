# Feature 2 Work Item 4 — Graphics/UX workspace-switcher gate review

**Review date:** 2026-08-21  
**Review type:** read-only final re-review  
**Verdict:** **ACCEPT**  
**Application code changed:** no

## Scope and evidence

Reviewed against [Feature 2 user, role, and membership journeys](./feature-2-user-role-membership-journeys.md) and [the workspace-selection checkpoint](../engineering/feature-2-workspace-selection-checkpoint.md). Develop reports focused browser coverage **9/9**, database coverage **106/106**, unit/direct-route coverage **38/38**, lint, and build success. The browser evidence covers A→B switching, two-tab reconciliation, stale removed membership, single-workspace behavior, direct cross-tenant denial, logout/direct-route protection, 320px actions, and retained Work Items 2–3 keyboard/200% coverage.

## Acceptance findings

- A single active Workspace is shown as context without switcher friction; the user is not forced through a chooser when there is only one available Workspace.
- Multiple active Workspaces expose an explicit **Switch workspace** route and chooser. Opening the chooser does not switch the current Workspace.
- Each choice contains only Workspace name, effective Role, and the **Current workspace** marker. Teams and inaccessible/suspended/removed/unrelated memberships are not exposed.
- Switch actions have accessible names, at least 44px mobile target sizing, busy copy **Switching…**, and status feedback before navigation.
- Success changes the session selection and navigates to the selected CRM home. The browser evidence confirms the sidebar and tenant data change from A to B, with no prior-tenant records retained.
- Failed switching preserves the current Workspace context and reports **“We couldn’t switch workspaces. Your current workspace is unchanged.”**
- A stale removed/suspended option is denied safely, removed from the chooser immediately, and replaced with an alert plus authoritative option reload. The current Workspace remains visible.
- Two tabs reconcile to the session-wide selected Workspace on their next request/reload; direct prior-tenant access is denied safely.
- Login/resume and selection-required behavior use the selected session Workspace; unauthenticated direct CRM access returns to login, while no active memberships do not expose an unauthorized chooser.
- Keyboard navigation, focusable controls, status/alert semantics, mobile layout, 320px no-overflow behavior, and 44px switch actions are covered by the focused evidence.
- The local-server boundary remains truthful. This gate does not approve unrelated Feature 5 work, production identity, or deployment.

## Bounded follow-up

No release-blocking workspace-switcher UX findings remain. Preserve the explicit chooser, current marker, failed-switch context retention, stale-option reload, and two-tab reconciliation behavior in future shell changes.

The four unrelated legacy Playwright failures recorded by Develop remain non-blocking: old CRM mobile trigger wording, old post-join heading, obsolete native Team confirmation expectation, and invitation resend timing. They do not intersect Work Item 4.

## Final gate

**ACCEPT.** Work Item 4 is approved for Graphics/UX. Workspace selection is explicit, server-authorized, tenant-safe, accessible, and responsive across the reviewed desktop, mobile, keyboard, and multi-tab journeys.

