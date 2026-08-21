# Feature 2 Work Item 3 — Graphics/UX stale-data gate review

**Review date:** 2026-08-21  
**Review type:** read-only final re-review  
**Verdict:** **ACCEPT**  
**Application code changed:** no

## Scope and evidence

Reviewed against [Feature 2 user, role, and membership journeys](./feature-2-user-role-membership-journeys.md) and [the stale-data checkpoint](../engineering/feature-2-stale-data-checkpoint.md). The checkpoint reports focused database/WI2-WI3 coverage **8/8**, complete integration **98/98**, lint/build success, and relevant browser coverage **7/7**. The browser evidence includes two-tab concurrency, conflict/reload/retry, stale suspended/removed targets, stale actor authority, role confirmation, invitation ceilings, 320px, and browser 200% zoom.

## Acceptance findings

- Role, suspend, restore, and remove requests use the last confirmed Membership version. The UI does not optimistically alter role, status, authority, or available actions.
- Successful mutations perform a fresh no-cache People read before announcing success, replacing role, status, version, actor capabilities, and available controls with server-authoritative values.
- Two-tab edits reconcile correctly: the stale write is rejected, the visible confirmed state is retained, the conflict is announced, **Reload latest** is available, and retry uses the newly read version and commits once.
- Stale actor-authority denial automatically refreshes People and capabilities. Obsolete role/action controls disappear before another submission can occur.
- Stale suspended and removed targets reconcile to the current row state without overwriting the newer server state or presenting an editable role control.
- Conflict and denial states do not produce false success, duplicate audit effects, or duplicate idempotency success records. Retry behavior is explicit and authoritative.
- Busy controls are disabled during mutation; conflict/error/success messaging remains visible and actionable. Reload returns focus to the affected control/context.
- Keyboard behavior is covered for conflict recovery, reload, retry, role controls, and confirmation flows.
- At 320px and browser 200% zoom, the People table remains an explicit internal scroll region while page-level width stays bounded; labels and role/action context remain reachable.
- The local-server authorization boundary remains truthful. No production provider, workspace switcher, or Feature 3 personal-settings behavior is implied by this gate.

## Bounded follow-up

No release-blocking stale-data UX findings remain. Preserve the focused two-tab and 320px/200% regression coverage when changing the People table, admin shell, or role/lifecycle controls.

The four unrelated legacy Playwright failures recorded by Develop remain non-blocking: old CRM mobile trigger naming, old post-join heading, obsolete native Team confirmation expectation, and invitation resend timing. They do not intersect Work Item 3.

## Final gate

**ACCEPT.** Work Item 3 is approved for Graphics/UX. The interface now reconciles role and membership state from the server after success, conflict, and denial without optimistic false state, and provides accessible recovery across the reviewed desktop and narrow layouts.

