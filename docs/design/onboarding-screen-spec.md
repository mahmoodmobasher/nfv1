# NexaFlow onboarding screen specification

Status: implementation-ready UX handoff; Graphics QA follow-up incorporated  
Direction: approved light experience, derived from the imported marketing site  
Scope: plan selection, authentication, workspace creation, initial access setup, and logout  

## 1. Experience principles

- Keep the journey linear: **Select plan → Create account → Verify identity → Create workspace → Confirm owner → Enter CRM**.
- Preserve context. The chosen plan and billing cadence remain visible from selection through workspace creation.
- Explain product concepts in business language. “Organization name” creates a workspace; the first registrant becomes its Workspace Owner.
- Do not require invitations or teams before CRM entry. These are clearly offered as optional setup.
- Use one primary action per screen. Secondary actions are visually quieter and never compete with it.
- Never rely on color alone for status, selection, errors, or required fields.
- Do not show users a blank page during network work. Keep the current surface in place and show local progress.

## 2. Shared visual system

These tokens follow the active marketing page. They supersede the unused purple/indigo defaults currently present in the global stylesheet for onboarding surfaces.

### Color tokens

| Token | Value | Use |
|---|---:|---|
| Canvas | `#F5F3EE` | Page background |
| Canvas warm | `#FFFDF8` | Alternating/featured background |
| Surface | `#FFFFFF` | Cards, inputs, menus |
| Surface muted | `#EEEBE4` | Summaries and secondary panels |
| Ink | `#17201D` | Headings, primary button |
| Text secondary | `#53605B` | Body copy |
| Text quiet | `#68736F` | Hints and metadata |
| Border | `#DED9D0` | Default controls and dividers |
| Orange | `#FF6B35` | Main conversion action and active accents |
| Orange dark | `#D94F20` | Text links and high-contrast orange text |
| Green | `#167C62` | Verified/success state |
| Error | `#B42318` | Error text/icon; pair with `#FEF3F2` background |
| Warning | `#9A6700` | Warning text/icon; pair with `#FFF8C5` background |

All text/background combinations must meet WCAG 2.2 AA contrast. Use dark orange for orange text on light backgrounds; reserve bright orange for filled controls and decorative accents.

### Type, shape, and spacing

- Font stack: `Avenir Next`, Avenir, `Segoe UI`, system sans-serif.
- Page title: 40/44 px desktop, 32/36 px mobile, 800–900 weight, letter spacing approximately `-0.04em`.
- Section title: 24/30 px, 800 weight. Body: 16/25 px. Label/button: 14/20 px, 700 weight. Helper: 13/19 px.
- Form controls: minimum 48 px high, 12 px radius; buttons: 48 px minimum, pill radius where consistent with the marketing site.
- Cards: 24 px radius desktop, 20 px mobile; 1 px border; restrained shadow `0 16px 48px rgba(23,32,29,.10)`.
- Spacing grid: 4 px base. Common gaps: 8, 12, 16, 24, 32, 48 px.
- Focus ring: 3 px `rgba(217,79,32,.28)` plus a visible 2 px dark-orange outline. Never remove the browser focus indication without replacement.
- Motion: 150–200 ms ease-out. Respect `prefers-reduced-motion`; no essential information may depend on motion.

### Shared shell

- Header: 72 px desktop / 64 px mobile, NexaFlow NF mark and wordmark linked to the website; right-side “Already have an account? Sign in” or context-relevant equivalent.
- Desktop (`≥1024 px`): centered two-column shell, maximum width 1180 px. Main task card 620–700 px; context panel 320–380 px.
- Tablet (`768–1023 px`): single main column up to 680 px; plan/context summary appears above the form as a compact card.
- Mobile (`<768 px`): 16 px page gutters, edge-to-edge flow, header wordmark simplified if needed. Cards use 20 px padding; primary action is full width.
- Progress: show “Step X of 4” and labels **Plan, Account, Workspace, CRM** on account/setup screens. Email verification is nested within Account and does not add a fifth step. The active step uses text, icon/number, and color.
- Footer: “Privacy”, “Terms”, and “Need help?” links. Do not repeat the marketing footer.

### Shared components and behavior

- **Plan summary:** plan, price, cadence, trial statement, included seats, and “Change plan” link. Do not show price if the plan is sales-led; show “Custom pricing”.
- **Text field:** persistent label above, optional helper below, error below helper or in its place. Required fields carry “Required” in accessible metadata; avoid unexplained asterisks.
- **Password field:** show/hide control with accessible name; requirement checklist updates as the user types without announcing every keystroke.
- **Alert:** icon, concise heading, explanatory text, and recovery action where relevant.
- **Loading button:** retains width, shows spinner plus an action-specific label such as “Creating workspace…”, and prevents duplicate submission.
- **Toast:** only for non-blocking confirmation. Errors affecting completion remain inline or as a page alert.
- **Session-expiry handling:** retain safe, non-secret form values and return to login with “Your session expired. Sign in to continue.”

## 3. Screen specifications

## `/select-plan`

**Purpose:** choose the package and billing cadence before account creation.

**Layout**

- Marketing header with a visible “Sign in” link; onboarding progress is not shown until a plan is selected.
- Hero centered over the pricing grid.
- Billing segmented control immediately above cards: **Monthly** / **Annual**. Annual includes a savings label only when the exact saving is supported by pricing data.
- Four cards: Essentials, Growth, Scale, Enterprise. Recommended plan may carry a “Most popular” badge, but only one card may be emphasized.
- Each self-service card shows name, short audience statement, price/cadence, included users, five or fewer differentiating features, and primary CTA.
- Enterprise uses **Contact sales** unless self-service provisioning is explicitly approved.
- Below cards: concise trial/no-card statement, package comparison disclosure, and FAQ link.

**Key copy**

- Eyebrow: “Start with the right foundation”
- H1: “Choose a CRM plan for your team”
- Support: “Start your 14-day trial. You can change your plan as your team grows.”
- CTA: “Start with {Plan name}”
- Signed-in CTA where applicable: “Continue with {Plan name}”

**States**

- Selection: 2 px dark-orange border, check icon, and “Selected” text. Selection persists if cadence changes.
- Loading: retain card geometry with skeletons; disable plan actions until pricing loads.
- Error: page-level alert: “We couldn’t load plans. Try again.” with **Try again**; do not display stale prices as current.
- No-JS/basic navigation: each CTA remains a real link with plan and cadence encoded in the destination.

**Responsive**

- Desktop: four columns if cards remain at least 260 px; otherwise two-by-two.
- Tablet: two columns. Mobile: one column with the recommended/most relevant plan first, while preserving semantic plan order in source where possible.
- Billing control remains visible above cards; never use horizontal-scroll-only pricing cards.

## `/register`

**Purpose:** create an individual identity while preserving the selected package.

**Layout/components**

- Step 2, **Account**. Main card on left; sticky plan summary on desktop right.
- Form fields: Full name, Work email, Password. Checkbox: accept Terms and Privacy. Do not collect workspace name here.
- Full-width Google button above a labelled divider “or continue with email”.
- Primary: **Create account**. Footer: “Already have an account? Sign in”.

**Key copy**

- H1: “Create your NexaFlow account”
- Support: “You’ll create your workspace after we verify your identity.”
- Google action: “Continue with Google”
- Consent: “I agree to the Terms of Service and Privacy Policy.”
- Submission: “Creating account…”

**Validation/states**

- Validate on blur and submission; move focus to an error summary on failed submission, then link each summary item to its field.
- Email: “Enter a valid work email address.” Password: “Use at least 12 characters, including a number and a symbol.” Consent: “Accept the terms to create an account.”
- Existing email: “An account already uses this email. Sign in or reset your password.” Provide both actions; do not confirm account existence before form submission.
- Google cancelled: non-destructive alert “Google sign-in was cancelled. You can try again or use email.”
- Provider/network failure: “We couldn’t create your account. Your information has not been lost. Try again.”
- Success routes email users to verification and Google users to workspace creation when the provider confirms the email identity.

## `/verify-email`

**Purpose:** confirm an email/password registrant’s identity.

**Layout/components**

- Narrow centered card (520 px maximum), envelope/check illustration rendered with interface icons rather than a decorative image.
- Masked destination address, **Open email app** when a safe platform link exists, and **Resend email** as secondary action.
- “Wrong email?” returns to registration with confirmation before replacing the pending address.

**Key copy**

- H1: “Check your email”
- Support: “We sent a verification link to {masked email}. Open it to continue creating your workspace.”
- Guidance: “The link expires in 24 hours. Check your spam folder if it doesn’t arrive.”
- Resent success: “A new verification email is on its way.”

**States**

- Resend has a visible cooldown and announces remaining availability politely; do not show a rapidly updating live-region countdown.
- Verification in progress: “Verifying your email…”
- Success: green check, “Email verified”, then **Continue to workspace**. Redirect after a short pause only if the button remains available.
- Expired: “This verification link has expired.” with **Send a new link**.
- Already used: “This email is already verified.” with **Continue**.
- Invalid: “This verification link isn’t valid.” with actions to resend or contact support.

## `/login`

**Purpose:** authenticate returning users and resume their correct destination.

**Layout/components**

- Centered card (520 px maximum); no onboarding progress.
- Google button, divider, Email, Password, **Forgot password?**, checkbox **Keep me signed in on this device**, primary **Sign in**, registration link.

**Key copy**

- H1: “Welcome back”
- Support: “Sign in to continue to your NexaFlow workspace.”
- No account: “New to NexaFlow? Choose a plan.”
- Loading: “Signing in…”

**States**

- Generic credential error: “Email or password is incorrect.” Do not disclose whether an email exists.
- Unverified account: “Verify your email before signing in.” with **Resend verification email**.
- Locked/rate-limited: “Too many attempts. Try again later or reset your password.” Do not publish sensitive lockout rules.
- Successful login resumes verification/workspace setup if incomplete; otherwise opens the last authorized workspace or workspace chooser.
- Google authentication errors follow the registration language and never erase an entered email.

## `/forgot-password`

**Purpose:** request a password-reset email without exposing account membership.

**Layout/components:** centered narrow card; Email field, primary **Send reset link**, secondary **Back to sign in**.

**Key copy**

- H1: “Reset your password”
- Support: “Enter your email and we’ll send instructions if it matches a NexaFlow account.”
- Universal success: “Check your email. If an account matches {masked email}, you’ll receive a reset link shortly.”
- Guidance: “The link expires in 1 hour.”

**States:** inline email-format validation; loading “Sending link…”; network error offers retry. Repeated requests show a cooldown and keep the same universal success language.

## `/reset-password`

**Purpose:** set a new password from a valid recovery link.

**Layout/components:** centered narrow card; New password, Confirm new password, visible requirement checklist, primary **Save new password**.

**Key copy**

- H1: “Choose a new password”
- Support: “Use a password you haven’t used for this account.”
- Mismatch: “Passwords do not match.”
- Success: “Password updated. You can now sign in with your new password.”
- Success CTA: “Continue to sign in”

**States**

- Inspect link before enabling the form. Loading: “Checking your reset link…”
- Expired/invalid: “This reset link is no longer valid.” with **Request a new link**.
- Submission loading: “Updating password…”; unexpected error keeps both entries locally unless security policy requires clearing them, and explains what happened.

## `/workspace/create`

**Purpose:** create the tenant/workspace and automatically establish its first owner.

**Layout/components**

- Step 3, **Workspace**. Main card plus plan summary.
- Fields: Workspace name; optional suggested workspace URL/slug if architecture supports editable slugs. Do not ask the user to choose their role.
- Informational panel with shield icon: “You’ll be the Workspace Owner” and a concise list: manage billing, invite users, assign roles.
- Checkbox only if legally needed for workspace/business terms; avoid duplicating account consent.
- Primary: **Create workspace**. Secondary: **Back** (preserves entered values).

**Key copy**

- H1: “Create your workspace”
- Support: “Your workspace keeps your company’s CRM records, users, and settings together.”
- Field label: “Workspace name”
- Helper: “Usually your company or team name. You can change it later.”
- Ownership: “As the first person here, you’ll become the Workspace Owner.”
- Trial: “Your 14-day trial starts when your workspace is created.”
- Loading: “Creating workspace…”

**Validation/states**

- Name required: “Enter a workspace name.” Trim leading/trailing whitespace and communicate length restrictions before submission.
- Slug collision, if exposed: suggest an available alternative without clearing the name.
- Provisioning is idempotent: repeated clicks or refresh must not create duplicate workspaces. UI disables navigation while final creation is committed and warns before leaving only when necessary.
- Failure: “We couldn’t finish creating your workspace. Try again. You won’t be charged and a duplicate workspace won’t be created.”
- Success routes to workspace-ready; do not start the trial earlier in the interface.

## Workspace-ready (`/workspace/ready` or agreed route)

**Purpose:** confirm successful provisioning and provide a clear first CRM action.

**Layout/components**

- Step 4, **CRM**. Centered success panel with green check and a compact summary: workspace name, plan, “Workspace Owner”.
- Primary: **Enter CRM**. Secondary: **Invite teammates**. Tertiary text link: **Review workspace settings**.
- “What’s next” row: Add your first lead, Invite your team, Set up roles. Make clear that only the first is needed to begin.

**Key copy**

- H1: “Your workspace is ready”
- Support: “{Workspace name} is set up, and you’re the Workspace Owner.”
- Reassurance: “You can invite people and organize teams now or later.”
- CRM CTA destination should emphasize **Add your first lead**.

**States**

- If CRM initialization continues after workspace creation, show determinate steps where possible and “Preparing your CRM…”; do not expose internal service names.
- Partial setup failure offers **Try again** and support reference; never suggest recreating the workspace.
- Reloading a completed URL remains safe and routes to the existing workspace.

## Invitations, roles, and optional teams

This may be a three-step drawer/modal flow launched from workspace-ready, or a full-page setup flow on small screens. It never blocks **Enter CRM**.

### Invite people

- Multi-entry work-email control with visible chips; paste and keyboard entry supported.
- Default role selector applies to the batch; each invite can be adjusted individually.
- Copy: H1 “Invite your team”; support “Invitations expire after 7 days. Pending invitations don’t use a seat.”
- Actions: **Send invitations** and **Skip for now**.
- Duplicate/self email: “This person is already a member or has a pending invitation.”
- Seat limit: identify the plan limit and provide **Review plan**; do not silently drop recipients.
- Partial success lists sent and unsent invitations separately with per-person retry.

### Assign roles

- Available MVP roles: **Owner**, **Admin**, **Member** with plain-language descriptions.
- Owner: full workspace and billing control. Admin: manages CRM configuration and users as permitted, but not ownership/billing unless the security contract says otherwise. Member: uses assigned CRM capabilities.
- The current sole Owner cannot remove or downgrade their own Owner role. Explain why inline.
- Primary: **Save roles**; secondary: **Back**; success “Roles updated.”
- Permission failures identify that the user lacks permission without exposing protected member data.

### Optional teams

- H1: “Organize people into teams”
- Support: “Teams help with routing, visibility, and collaboration. You can set them up later.”
- Empty state: team-name field plus member picker; suggested examples “Sales”, “Customer Success”, “Delivery”.
- Actions: **Create team**, **Finish setup**, **Skip for now**.
- Team creation success appears inline and supports adding another. Duplicate team name error does not clear selected members.
- Mobile uses full pages or bottom sheets with a visible Close/Back control; avoid nested modal dialogs.

## 3A. Graphics QA follow-up: implementation-ready additions

These additions close the Graphics QA findings while preserving the approved light visual direction and shared shell.

### Complete invitation flow (`/invite`)

- Present as a step from workspace-ready, but keep **Enter CRM** available at all times. Desktop may use a right-side drawer; mobile uses a full page or bottom sheet with a visible **Back** or **Close** control.
- H1: “Invite your team”. Support: “Invitations expire after 7 days. Pending invitations don’t use a seat.”
- Form order: multi-entry **Work email** field, **Add** affordance, entered email chips, **Default role** selector, invitation list, primary **Send invitations**, secondary **Skip for now**.
- Accept comma, semicolon, space, paste, and Enter as separators. Normalize case and trim whitespace. Each chip has a 44×44 px remove button with an accessible name such as “Remove alex@example.com”.
- Default role options: Member, Admin. Do not offer Owner in the invitation default; ownership changes are handled in role review.
- Each invitation row shows email, role selector, and remove action. Changing the default role does not overwrite an individually changed role.
- Empty state: “Add at least one work email to send an invitation.” Invalid entry: “Enter a valid work email address.” Duplicate/self entry: “This person is already a member or has a pending invitation.” Keep valid chips when one entry fails.
- Seat-limit state names the plan and remaining seats: “Your Growth plan has 2 invitation seats remaining.” Provide **Review plan** and do not silently discard recipients.
- Loading retains chips and row geometry. Button label: “Sending invitations…”. Disable duplicate submission, but keep **Skip for now** available unless the server is committing the batch.
- Partial success shows two labelled groups: **Invitations sent** and **Couldn’t send**. Each failed row has **Retry**. Do not re-send successful recipients.
- Full success: “Invitations sent.” Keep a visible **Continue to CRM** action. No success toast is the sole confirmation.
- Network/provider failure: “We couldn’t send invitations. Your entries are still here. Try again.”

### Workspace settings and fixed-role review (`/workspace/settings`)

- H1: “Workspace settings”. Support: “Review your workspace details and the people who can manage it.”
- Desktop layout: settings navigation/section list on the left and one main card on the right. Mobile layout: stacked sections with a visible back link to CRM; do not use nested dialogs.
- Details card: **Workspace name**, optional **Workspace URL**, plan/cadence summary, trial status, and **Change plan** link. Use persistent labels and `autocomplete="organization"` for the workspace name.
- Ownership card: “You’re the Workspace Owner”. Explain: “The Workspace Owner has full workspace and billing control.”
- Fixed-role review table columns: Person, Email, Role, Status, Actions. MVP roles are Owner, Admin, Member with the plain-language descriptions defined above.
- The sole Owner row shows **Owner** as fixed text and helper text: “You can’t remove or downgrade the only Workspace Owner.” No misleading disabled select is required; explain the constraint inline.
- Admin/member rows may expose a role selector only to authorized users. Permission failure: “You don’t have permission to change workspace roles.” Do not reveal protected member data.
- Save action: **Save roles**. Loading: “Saving roles…”. Success inline: “Roles updated.” Failure preserves selections: “We couldn’t update roles. Your changes are still here. Try again.”
- Empty member state: “No teammates have been invited yet.” with **Invite your team**.

### Workspace-ready content (`/workspace/ready`)

- H1: “Your workspace is ready”. Support: “{Workspace name} is set up, and you’re the Workspace Owner.”
- Summary must show Workspace, Plan, and Role: Workspace Owner.
- Primary CTA: **Add your first lead** and route directly to the lead form. Secondary: **Invite teammates**. Tertiary: **Review workspace settings**.
- Supporting reassurance: “You can invite people and organize teams now or later.”
- “What’s next” is an ordered three-item row/card: **Add your first lead** (Needed to begin), **Invite your team** (Optional), **Set up roles** (Optional). Mark only the first item as the recommended next action; do not rely on color alone.
- If CRM initialization continues, replace the CTA area with determinate progress where available and “Preparing your CRM…”. A failure offers **Try again** and a support reference; never suggest recreating the workspace.

### Actual lead-capture form (`/crm/leads/new`)

- H1: “Add your first lead”. Support: “Create a shared customer record so your team can follow up.” Keep the CRM shell and onboarding context visible.
- Form fields, in order: **First name** (required), **Last name** (required), **Work email** (required), **Company** (required), **Phone** (optional), **Lead source** (required select: Website, Referral, Event, Partner, Other), **Owner** (defaults to current user), and optional **Notes**.
- Persistent labels, concise helper text, and `autocomplete` values: `given-name`, `family-name`, `email`, `organization`, `tel`. Do not put sensitive values in the URL.
- Primary: **Save lead**. Secondary: **Cancel** returns to CRM without discarding confirmation if changes exist. Loading: “Saving lead…”.
- Required-field errors: “Enter a first name.”, “Enter a last name.”, “Enter a work email address.”, “Enter a company name.”, and “Choose a lead source.”
- Invalid email: “Enter a valid work email address.” Duplicate warning is non-blocking: “A lead with this email may already exist.” Offer **Review existing lead** and **Save anyway** where supported.
- Success page/state: “Lead added.” Show the company and lead name, then offer **View lead** as primary and **Add another lead** as secondary. CRM overview remains available.
- Save failure preserves all non-sensitive entries: “We couldn’t save this lead. Your information is still here. Try again.”
- Empty CRM state after the first lead: retain the same first-action pattern with **Add a lead** and a concise explanation of what the CRM stores.

### CRM next-step and onboarding context

- CRM overview header includes workspace name, current role, and a dismissible but persistent-until-complete onboarding card titled **Get started with NexaFlow**.
- The card contains three steps: Add your first lead, Invite your team, Review workspace settings. The first incomplete step is visually recommended and is also represented by text and an icon/check state.
- After a lead is saved, update the card to recommend **Invite your team**. After invitations are sent or skipped, recommend **Review workspace settings**. Allow all steps to be revisited.
- Include a text action **Dismiss setup**. Confirmation is required only if dismissing would lose unsaved form data; dismissal does not delete workspace data.
- On mobile, the card appears before the CRM content and remains readable at 320px without horizontal scrolling. The account/navigation menu must expose CRM overview, Leads, Workspace settings, and Sign out in that order.

### Production copy transition

- Preview-only banners and “Dummy details only”, “Demonstration password”, “preview”, “nothing is sent”, and “production … not connected” wording must be removed when backend integration begins.
- Production registration copy: H1 “Create your NexaFlow account”; password label “Password”; submit loading “Creating account…”. Use password managers normally and `autocomplete="new-password"`.
- Production login copy: password label “Password”; `autocomplete="current-password"`; generic credential error remains “Email or password is incorrect.”
- Production workspace copy removes “local workspace preview” and confirms actual provisioning. Production CRM copy removes “CRM data is not persisted” and server-connection warnings.
- Keep the same recovery, consent, role, and invitation language unless product/legal approves a change. Preview disclaimers are environment chrome, not reusable product copy.

### Unique route titles

Use one unique title per route, with the product suffix “| NexaFlow”:

- `/select-plan`: “Choose a CRM plan | NexaFlow”
- `/register`: “Create your NexaFlow account | NexaFlow”
- `/verify-email`: “Check your email | NexaFlow”
- `/login`: “Welcome back | NexaFlow”
- `/forgot-password`: “Reset your password | NexaFlow”
- `/reset-password`: “Choose a new password | NexaFlow”
- `/workspace/create`: “Create your workspace | NexaFlow”
- `/workspace/ready`: “Your workspace is ready | NexaFlow”
- `/invite`: “Invite your team | NexaFlow”
- `/workspace/settings`: “Workspace settings | NexaFlow”
- `/crm`: “CRM overview | NexaFlow”
- `/crm/leads/new`: “Add your first lead | NexaFlow”

Titles must update for meaningful state changes only when the new state is important, for example “Invitations sent | NexaFlow” or “Lead added | NexaFlow”.

### Mobile navigation refinement

- At widths below 901px, replace the desktop sidebar with a compact header containing the NF mark/wordmark, current workspace name where space allows, and a 44×44 px menu button.
- The menu opens an anchored panel with a visible backdrop or clear boundary, closes on Escape, returns focus to the menu button, and exposes an accessible name that changes between “Open navigation” and “Close navigation”.
- Menu order: CRM overview, Leads, Workspace settings, then Sign out separated by a divider. Unavailable preview destinations should not appear as disabled navigation items in production.
- The panel must not obscure the page title without an explicit close action. It must remain usable at 320px and at 200% zoom.
- Preserve the light palette: white surface, `#DED9D0` border, `#17201D` ink, and dark-orange focus ring. Do not introduce a new mobile-only color system.

## Logout confirmation and behavior

**Entry point:** avatar/account menu in the authenticated CRM shell. “Sign out” is the final menu item and has a sign-out icon; it is not styled as destructive red because it does not delete data.

**Default behavior**

- Selecting **Sign out** ends the authenticated session, clears locally cached sensitive workspace data, and routes to `/login` with confirmation: “You’ve been signed out.”
- Server/session revocation is authoritative; using Back must not reveal protected content. Protected routes redirect to login.
- Signing out of NexaFlow does not claim to sign the user out of Google.
- Multi-workspace switching belongs elsewhere in the account menu and must not be confused with logout.

**Confirmation rule**

- Do not add friction for normal logout.
- If the current screen has unsaved changes, show a confirmation dialog: title “Sign out and discard changes?” body “Your unsaved changes on this page will be lost.” actions **Keep editing** (initial focus) and **Sign out**.
- Dialog uses `role="alertdialog"`, traps focus, closes on Escape, and returns focus to the initiating item.

**States**

- Pending: menu item reads “Signing out…” and ignores duplicate requests.
- Network/server failure: clear only what security policy permits and show “We couldn’t confirm sign-out. Try again.” If the local session is invalidated safely, route to login and state “You’re signed out on this device.”
- Session timeout uses “Your session expired. Sign in to continue.”, not the voluntary logout message.

## 4. Accessibility and interaction acceptance criteria

- Every page has one visible H1 and a unique document title.
- Keyboard order follows the visual order; all actions work without pointer input.
- Inputs have programmatic labels, descriptions, errors, and correct `autocomplete` values (`name`, `email`, `new-password`, `current-password`, `organization`).
- Error summaries receive focus after invalid submission; field errors are associated with `aria-describedby` and do not disappear while invalid.
- Status announcements use appropriately scoped polite live regions; blocking errors use alerts. Do not announce decorative loading animations.
- Icons are decorative when adjacent text provides meaning; icon-only controls have explicit accessible names and 44×44 px minimum targets.
- Plan comparison, roles, and progress remain understandable at 200% zoom and in high-contrast/forced-color modes.
- Authentication pages avoid CAPTCHA unless abuse controls require it; any challenge must provide an accessible alternative.
- Sensitive values never appear in URLs, analytics events, toast text, or client logs.
- All screens support 320 px width without horizontal page scrolling and desktop widths without overlong form lines.

## 5. Content and analytics notes

- Use “Sign in” for an existing session and “Create account” for registration; avoid mixing “log in” and “sign in” in interface copy.
- Use “workspace” consistently for the company data boundary, “account” for the individual identity, and “plan” for the commercial package.
- Instrument step views, primary actions, validation failure categories, provider choice, verification/resend, workspace success/failure, CRM entry, invitation results, and logout. Never record passwords, full reset/verification URLs, or invitation tokens.
- Package names, price, included users, savings, trial eligibility, and feature lists must come from the approved commercial source of truth rather than duplicated display constants.

## 6. Handoff dependencies

- Architecture must confirm route guards, Google callback behavior, token expiry, idempotent workspace creation, sole-Owner protections, permissions, plan entitlements, seat counting, and audit-event requirements.
- Product must confirm current prices/features, whether Enterprise is sales-led, exact trial eligibility, legal links, supported workspace-name/slug rules, and support contact.
- Engineering should preserve the selected plan/cadence across authentication callbacks and safely resume the first incomplete onboarding step.

## 7. Develop acceptance checklist

Develop can mark this package accepted when all of the following are true:

- [ ] Invitation flow supports multi-entry work emails, chips, default and per-person roles, validation, duplicate/self handling, seat limits, loading, full success, partial success, retry, and skip behavior.
- [ ] Workspace settings shows workspace details, plan context, owner explanation, fixed sole-Owner protection, role review, permission failures, save loading, success, and retry-preserving failure states.
- [ ] Workspace-ready uses the approved copy and routes the primary **Add your first lead** action directly to the lead form.
- [ ] Lead form is functional with all specified fields, labels, autocomplete values, validation, loading, duplicate warning behavior, save failure preservation, and success actions.
- [ ] CRM overview exposes the three-step onboarding context and updates the recommended next step after lead creation, invitation, or skip.
- [ ] Production builds remove all preview/demo-only wording and banners while retaining equivalent recovery and confirmation semantics.
- [ ] Every listed route has its own document title, one visible H1, and correct title updates for meaningful success states.
- [ ] Mobile navigation works at 320px and 200% zoom, supports keyboard and Escape dismissal, returns focus correctly, and exposes all required destinations.
- [ ] All form errors are programmatically associated, error summaries receive focus after invalid submission, and live-region scope matches the severity of each state.
- [ ] Interactive controls meet the 44×44 px target, focus rings remain visible, and no status depends on color alone.
- [ ] Desktop, tablet, mobile, high-contrast/forced-color, reduced-motion, and keyboard-only checks pass without horizontal scrolling or overlong form lines.
- [ ] Analytics capture only approved events and never include passwords, full verification/reset URLs, invitation tokens, or other sensitive values.

Acceptance recommendation: **Conditional acceptance for design handoff; not ready for implementation sign-off until Develop verifies every checkbox above against the integrated backend states.**
