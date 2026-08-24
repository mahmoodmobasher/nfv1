# Nexa Spectrum Phase 4 — Authentication and onboarding

**Status:** Implementation-ready Graphics and UX authority

**Date:** 2026-08-23

**Visual authority:** `docs/design/nexaflow-spectrum-complete-redesign.md` at `f9ecd34`

**Scope:** Plan selection, registration, verification, login, OIDC states, recovery/reset, initial Workspace provisioning, legitimate Workspace selection, Workspace ready, invitation preview, and server-backed invitation acceptance

## Outcome

Phase 4 moves every public authentication and onboarding surface onto the canonical Nexa Spectrum foundation through the thin `.experience-website` configuration. It must not introduce route-level colours, Dark selectors, typography, radii, elevation, or theme resolution.

The experience should feel related to the operational product but more spacious and explanatory: neutral canvas, blue conversion actions, semantic feedback, restrained bordered panels, Inter, and one clear task per screen. Violet remains reserved for real AI/automation or user categorization and does not decorate authentication.

## Canonical commercial and tenancy policy

All UI, copy, state logic, tests, and handoffs must express these truths:

1. One self-service website subscription entitles exactly one Workspace for one company.
2. The verified registering company representative becomes the sole initial **Owner**. Owner is a persisted role distinct from Admin.
3. Included seats are total active Workspace seats and include the Owner. A five-seat plan means one Owner plus up to four additional active Admins/Members.
4. Owner controls subscription, ownership, and overall governance. Admin authority remains within server-authorized ceilings.
5. Normal invitations offer **Admin** or **Member** only. Owner is never an invitation option.
6. Company departments and ordinary teams belong inside the same Workspace through Teams/RBAC/ownership/visibility.
7. Additional company Workspaces are not a self-service feature. Multi-Workspace deployments are custom Enterprise/Contact Sales.
8. A global User may hold legitimate Memberships in other companies or an Enterprise deployment. Never implement this policy as one Membership per User.
9. The Workspace chooser only selects among existing active Memberships. It never creates or entitles another Workspace.
10. Billing providers, upgrades/downgrades, and Enterprise provisioning remain unavailable until separately authorized.

## Central implementation boundary

- Apply `.experience-website` to the single shared public/auth/onboarding root.
- `.experience-website` may configure density and layout aliases only. It consumes canonical `--nx-*` semantics; it does not redeclare the palette.
- Reuse central Button, Field, Select, Checkbox, Alert, Badge, Panel, Progress, Dialog and Loading primitives. If code reuse is not yet practical, selectors must still consume the same semantic contract and be covered by boundary tests.
- No route file may contain colour literals, `data-theme`/`data-account-theme` selectors, font families, raw radii, or raw shadows.
- Remove or contain legacy `.onboarding-*`, `.flow-card`, coral/beige/evergreen, pill-button, and high-weight rules as each Phase 4 surface migrates. Do not patch Dark mode after the fact.
- The authoritative pre-paint theme engine remains unchanged. Public System resolves from the OS before first paint; authenticated onboarding uses server preference when available.

## Shared website shell

### Desktop (1280 target)

- 64px header with linked NexaFlow brand at left and one context action at right: **Sign in**, **Choose a plan**, or **Need help?** according to the route.
- Environment disclosure immediately below the header when applicable; information tokens, sentence case, readable wrapping, and real environment-driven visibility.
- Main region max width 1120px. Task panel 600–680px; context/plan panel 320–360px. Gap 32px.
- Authentication without a plan context uses one centered 520–600px task panel.
- Footer uses real or explicitly pending Privacy/Terms status; pending text must not look clickable.

### Tablet (768)

- One centered column up to 680px.
- Context/plan summary precedes the task panel and may collapse to a disclosure only if its summary remains visible and keyboard operable.
- Header actions remain labelled; no icon-only account/navigation substitute.

### Mobile (390 and 320)

- 16px gutters at 390; 12–14px at 320 only when needed.
- Header 56–64px; brand remains identifiable. Secondary header copy may shorten but its action label remains visible.
- Panels use 16–20px padding; form actions become full-width.
- Onboarding progress becomes a compact ordered step indicator without horizontal scrolling.
- No fixed action obscures validation, browser password controls, or the software keyboard.

### 200% proxy

- Test at 640×720. Layout becomes the same single-column structure as narrow viewports.
- Focused fields, summaries, password visibility controls, context panels and primary recovery actions remain fully visible after scrolling.

## Typography and hierarchy

- Inter Variable; weights 400, 500 and 600 only.
- One H1: 32/40/600 desktop, 28/36/600 at 320 when necessary.
- Section/context title: 24/32/600.
- Panel title: 18/26/600.
- Body: 15/23/400; strong 600.
- Label: 13/18/500; metadata 12/17/400.
- Sentence case. Replace routine uppercase eyebrow copy with a compact neutral context label.
- Progress, plan, price, seat allowance and Owner outcome must be scannable without competing with the task H1.

## Journey and route authority

### 1. Plan selection — `/select-plan`

H1: **Choose one Workspace plan for your company**

Supporting copy: **Each self-service subscription includes one company Workspace. The included seats are total active seats and include the Owner.**

- Monthly/Annual is a labelled single-choice control with current state beyond colour.
- Plan cards show plan name, per-user price, total included active seats, and the plain-language composition: e.g. **5 seats total: 1 Owner + up to 4 Admins or Members.**
- Selected plan uses selected border/surface, check icon and text **Selected**.
- Primary action: **Start with [Plan]**.
- Billing-disconnected note is adjacent to the action/price: **No payment is collected in this environment. Production billing and plan changes are not connected.**
- Enterprise card: **Need multiple Workspaces or custom capacity? Contact Sales for an Enterprise deployment.** It never links to self-service Workspace creation.
- States: catalog loading, catalog unavailable, cadence unavailable, selected, keyboard focus, return/resume selection, and billing disconnected.

### 2. Registration — `/register`

H1: **Create your company account**

Supporting copy: **After your work email is verified, you’ll create the one company Workspace included with this subscription and become its sole initial Owner.**

- Show compact chosen plan summary including total seats and Owner inclusion.
- Fields: full name, work email, password, Terms/Privacy agreement.
- Password requirements are linked, live but not noisy, and never announced on every keystroke.
- OIDC control appears only when the provider is actually available. Fixture mode says **Continue with local Google fixture — non-production**. Disabled production mode is non-interactive and explains availability; it never resembles a failed password login.
- Preserve non-secret inputs after validation/network errors. Never retain or echo passwords.
- Duplicate/pending-account handling remains bounded and non-enumerating.
- Busy action: **Creating account…**; success navigates to verification without a duplicate toast.

### 3. Verification — `/verify-email`

States are distinct screens within one route:

- Waiting: **Check your email** with masked or user-provided email, delivery guidance, resend and wrong-email recovery.
- Checking: stable task panel with `role=status`, **Verifying your email…**, no blank layout.
- Verified: **Email verified**; explain that the account is active and continue to sign in.
- Invalid/expired/replaced/used: one safe bounded explanation plus **Request another link**.
- Resent: generic success copy; older links cannot be used.
- Delivery unavailable: preserve email and provide Retry/Back to registration without claiming delivery.

Local may mention Mailpit only in a development-only detail. UAT stays provider-neutral. Production must not expose provider names.

### 4. Login and OIDC — `/login` and callback states

H1: **Welcome back**

- Email/password fields, Forgot password, Sign in and Choose a plan remain the primary structure.
- Successful login routes according to authoritative state: existing active Membership(s), incomplete initial onboarding, or safe access recovery. It must not always imply another Workspace can be created.
- OIDC states remain separate and recoverable:
  - Disabled: **Google sign-in isn’t available in this environment. Use email and password.**
  - Cancelled: **Google sign-in was cancelled. No changes were made.**
  - Provider unavailable/protocol failure: **Google sign-in couldn’t be completed. Try again or use email and password.**
  - Link conflict: **This Google account can’t be linked automatically. Sign in with your existing method or contact support.**
  - Local fixture: explicit non-production badge and disclosure.
- Invalid credentials remain generic. Session expired and access changed have separate messages.
- Busy state preserves button width and disables duplicate submission.

### 5. Recovery and reset — `/forgot-password`, `/reset-password`

- Request response remains enumeration-safe: **If a matching active account exists, a recovery message was queued.**
- Keep the entered email after service failure and offer Retry/Back to sign in.
- Reset distinguishes missing, invalid, expired, replaced and already-used only to the bounded extent the existing security contract permits.
- New/confirm password fields have accessible show/hide controls, linked requirements and a focusable error summary.
- Successful reset states **Password updated. Existing sessions were revoked.** and offers Continue to sign in.
- No automatic login after reset unless separately authorized.

### 6. Initial Workspace creation — `/workspace/create`

H1: **Create your company Workspace**

Required copy:

> Your subscription includes one Workspace for this company. After creation, you will be its sole Owner. Included seats count the Owner.

- Field label: **Company or Workspace name**. Hint: **Use the company name your team will recognize.**
- Owner panel: **You’ll be the sole initial Owner** and **Owner is distinct from Admin and controls subscription, ownership and governance.**
- Plan panel states the total seats and remaining additional active seats after Owner: e.g. **5 total active seats: you as Owner plus up to 4 Admins or Members.**
- Primary action: **Create company Workspace** / **Creating Workspace…**.
- No secondary **Create another Workspace** action.
- If a self-service Workspace is already provisioned, redirect to ready/active Workspace; do not show a reusable create form.
- Entitlement denial: **This subscription already has its company Workspace. Open it, choose an existing Workspace you can access, or contact Sales for Enterprise multi-Workspace capacity.**
- Failure preserves name and plan; no partial-success claim.

### 7. Workspace ready — `/workspace/ready`

H1: **Your company Workspace is ready**

- Summary: Workspace, plan, **total active seats**, **Your role: Owner**.
- Reassurance: **You are the sole initial Owner. You control subscription, ownership and Workspace governance.**
- Primary: **Add your first lead**.
- Secondary: **Invite Admins or Members**. Explain that invitations are optional and active accepted users consume the remaining plan seats.
- Never call Owner an Admin or imply that invited Admins share ownership/subscription control.

### 8. Workspace selection — `/workspace/switch`

H1: **Choose a Workspace you can access**

Supporting copy:

> These are existing Workspace Memberships assigned to your account. Choosing one does not create or purchase another Workspace.

- Render only when two or more legitimate active Memberships exist. One option redirects directly; zero follows the authorized onboarding/access recovery path.
- Each option shows Workspace name, company context if available, Role, and Current marker.
- No Add/Create Workspace control.
- Optional footer: **Need a multi-Workspace company deployment? Contact Sales.** This is informational, not an entitlement bypass.
- Failed switch preserves current context and offers Retry/Reload latest. Stale choices are removed truthfully.

### 9. Invitation preview — `/invite`

- This route remains unmistakably non-persistent: **Invitation preview — no invitation, seat, membership or email is saved or authorized.**
- Preview role choices are Admin and Member only.
- Seat copy counts Owner: **[Plan] includes N total active seats. The Owner uses one; up to N−1 additional Admins or Members can be active. Pending preview invitations do not reserve a real seat.**
- Preview success must say **This preview did not send email or create Memberships.**
- Provide **Open Workspace invitations** only when the authenticated user is actually authorized; otherwise explain the preview boundary.

### 10. Server-backed invitation acceptance — `/workspace/invitations/accept`

- Pre-accept screen shows invited Workspace, invited Role (**Admin** or **Member**), inviter/context when authorized, expiry, and consequence: **Accepting activates a Membership and uses an available active seat.**
- Never offer or display Owner as an invitation role.
- If unauthenticated, sign-in/registration continuation must preserve the opaque invitation context without exposing its token.
- Busy: **Joining Workspace…** and duplicate submission blocked.
- Success: **You joined [Workspace] as [Admin/Member].** Primary **Open Workspace**.
- Seat exhausted: **This Workspace has no available active seats. Ask its Owner or an authorized Admin to make capacity available.**
- Invalid/expired/revoked/already-used/access-changed use bounded copy and a request-new-invitation recovery.
- Decline is a quiet secondary action and must not imply server-side revocation unless the contract actually records decline.

## Form and interaction rules

- Labels remain visible. Required status uses text, not only an asterisk.
- Help precedes error IDs in `aria-describedby`; invalid controls set `aria-invalid=true`.
- On submit, focus a linked error summary; links move focus to the affected field.
- Preserve safe text/select/checkbox input after failure. Clear password values after security-sensitive server failures when appropriate.
- Password show/hide controls are 44px, named, keyboard accessible and do not steal the field label.
- Busy buttons preserve width, use progress text, set `aria-busy` at the form/region, and prevent duplicate mutation.
- Inline errors requiring action remain in the page; completion status may use polite status announcements.
- One primary action per state. Back, resend, change plan and decline remain secondary/quiet.
- Browser autofill must retain readable surface/text/focus in Light and Dark.

## Theme, motion and platform behavior

- Light/Dark/System update the entire website experience, native controls, overlays, loading and error boundaries without reload or flash.
- Anonymous System follows OS changes without persisting an explicit theme. Authenticated onboarding follows the authoritative account preference where available.
- Route transitions never briefly reveal legacy beige/coral/evergreen.
- Motion is limited to 120–180ms opacity/colour/border transitions; no scale or layout motion. Reduced motion shortens/removes transitions.
- Forced colours preserves form boundaries, selection/current indicators, alerts, progress, focus, password visibility, and plan selection.

## Accessibility and responsive acceptance

- WCAG AA: 4.5:1 normal text; 3:1 large text and essential boundaries; focus 3:1 against adjacent surfaces.
- 2px minimum focus indicator with 2px offset/equivalent area.
- 44×44 minimum targets for controls and meaningful links where required.
- Logical landmarks and heading hierarchy; one H1.
- Progress is an ordered navigation/list with current step conveyed semantically.
- No page-level horizontal overflow at 320px or 400% reflow.
- Error, verification, invitation and Workspace state never depend on colour alone.
- Email addresses, company names and provider errors wrap safely.

## Explicit non-goals

- Production billing, payment collection, upgrade/downgrade, invoices or proration.
- Production Google/OIDC certification.
- Self-service additional Workspace creation.
- Public multi-Workspace plan.
- Owner invitation or generic role assignment.
- Automatic Teams setup.
- New global account/session-management features.

## Implementation sequence

1. Attach all Phase 4 roots to `.experience-website`; establish boundary tests and shared website shell.
2. Migrate plan selection and plan summary with canonical seat/Workspace copy.
3. Migrate registration, verification, login/OIDC and recovery/reset.
4. Migrate initial Workspace creation/ready and legitimate chooser.
5. Migrate invitation preview and server-backed acceptance.
6. Run the complete matrix in `nexa-spectrum-phase-4-acceptance-matrix.md`; do not auto-accept screenshots.

