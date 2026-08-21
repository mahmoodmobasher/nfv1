# Feature 2 Work Item 2 — Graphics/UX gate review

**Review date:** 2026-08-21  
**Review type:** read-only final re-review  
**Verdict:** **ACCEPT**  
**Application code changed:** no

## Scope and evidence

Reviewed the completed remediation against [Feature 2 user, role, and membership journeys](./feature-2-user-role-membership-journeys.md) and [the authority checkpoint](../engineering/feature-2-role-authority-checkpoint.md). The focused Work Item 2 browser suite passed **2/2**, covering desktop authority/keyboard/stale reload/Admin invitation behavior and 320px/browser-200%-zoom behavior. Relevant tenant-admin browser coverage passed **2/2**.

## Acceptance findings

- Invitation role choices are now derived from persisted server policy: Owner may assign Member/Admin; Admin may assign Member only; Member has no invitation action. Owner is absent from generic invitation and role controls.
- People role controls remain server-derived per target membership. Owner, suspended, removed, self, and unauthorized targets are read-only or unavailable with explanatory copy.
- Member → Admin opens the required accessible alert dialog: **“Change {name} to Admin?”** / **“This changes what they can access and manage in the workspace.”** Cancel receives initial focus; Escape cancels; focus is contained and restored to the role control.
- Successful elevation uses authoritative state and **Saving role…** / success feedback; duplicate submission is prevented while busy.
- Stale authority produces an actionable alert: **“Your permissions changed while you were viewing this page. Reload the latest roles and permissions.”** **Reload latest** refreshes people and actor capabilities, removes obsolete options, preserves the last confirmed role, announces **Latest values loaded.**, and restores context focus.
- Busy, success, conflict, and error messages are associated with the relevant role/invitation context and do not create false success states.
- Keyboard flows pass for role selection, confirmation, cancellation, focus return, stale recovery, and invitation controls.
- 320px and 200% browser zoom evidence passes with page-level width bounded and the People table retained as an explicit internal scroll region.
- No remaining Work Item 2 UX blockers were found. The local-server boundary remains truthful; no production email or external identity behavior is implied.

## Bounded follow-up

No release-blocking findings remain for Work Item 2. Keep the internal People table scroll cue visible and preserve the focused test coverage in future shell/layout changes.

## Final gate

**ACCEPT.** Work Item 2 is approved for Graphics/UX from the bounded role-authority perspective. This decision does not approve unrelated workspace switching, Feature 3 personal settings, production providers, or deployment work.

