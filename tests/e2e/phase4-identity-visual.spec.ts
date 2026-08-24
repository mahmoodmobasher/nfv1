import { expect,test,type BrowserContext,type Locator,type Page } from "playwright/test";
import { sealIdentityTokenIntent } from "../../src/server/identity/token-intent";

const localSecret="local-only-session-secret-change-me-32chars";

async function settle(page:Page){
  await expect(page.locator(".experience-website")).toBeVisible();
  await page.locator("nextjs-portal").evaluateAll(portals=>portals.forEach(portal=>portal.remove()));
  await page.addStyleTag({content:"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"});
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior="auto";window.scrollTo(0,0)});
}

async function capture(page:Page,name:string){
  await settle(page);
  await expect(page).toHaveScreenshot(name,{fullPage:true,animations:"disabled"});
}

async function theme(page:Page,effective:"light"|"dark"){
  await page.emulateMedia({colorScheme:effective,forcedColors:"none",reducedMotion:"reduce"});
}

async function resetIntent(context:BrowserContext){
  const value=sealIdentityTokenIntent("password_reset","visual-reset-token-value-long-enough-123456",localSecret,Date.now());
  await context.addCookies([{name:"nexaflow_password_reset_intent",value,domain:"127.0.0.1",path:"/reset-password",httpOnly:true,sameSite:"Lax"}]);
}

async function invalidVerification(context:BrowserContext){
  await context.addCookies([{name:"nexaflow_email_verification_intent",value:"invalid",domain:"127.0.0.1",path:"/verify-email",httpOnly:true,sameSite:"Lax"}]);
}
async function verificationIntent(context:BrowserContext){const value=sealIdentityTokenIntent("email_verification","visual-verification-token-long-enough-123456",localSecret,Date.now());await context.addCookies([{name:"nexaflow_email_verification_intent",value,domain:"127.0.0.1",path:"/verify-email",httpOnly:true,sameSite:"Lax"}])}

const viewports={desktop:{width:1280,height:900},tablet:{width:768,height:1024},mobile390:{width:390,height:844},mobile320:{width:320,height:640},zoom200:{width:640,height:720}} as const;

async function gotoState(page:Page,path:string,effective:"light"|"dark",viewport:keyof typeof viewports){await page.setViewportSize(viewports[viewport]);await theme(page,effective);await page.goto(path);await expect(page.locator("html")).toHaveAttribute("data-theme",effective)}

async function fillRegistration(page:Page){await page.getByLabel("Full name").fill("Morgan Rivera");await page.getByLabel("Work email").fill("morgan.rivera@example.test");await page.locator("#password").fill("Visual-password-123!")}
async function fillLogin(page:Page){await page.getByLabel("Email").fill("morgan.rivera@example.test");await page.locator("#password").fill("Visual-password-123!")}
async function fillReset(page:Page){await page.locator("#password").fill("Visual-password-123!");await page.locator("#confirm").fill("Visual-password-123!")}
async function sessionEmail(page:Page,value:string|null){await page.goto("/login");await page.evaluate(email=>email===null?sessionStorage.removeItem("nexaDemoEmail"):sessionStorage.setItem("nexaDemoEmail",email),value)}

function rgb(value:string){return value.match(/[\d.]+/g)!.slice(0,3).map(Number)}
function contrast(foreground:string,background:string){const channel=(value:number)=>{const normalized=value/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4},luminance=(value:string)=>{const [red,green,blue]=rgb(value).map(channel);return .2126*red+.7152*green+.0722*blue},values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);return(values[0]+.05)/(values[1]+.05)}
async function effectiveBackground(target:Locator){return target.evaluate(element=>{let current:Element|null=element;while(current){const value=getComputedStyle(current).backgroundColor;if(value!=="transparent"&&!/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(value))return value;current=current.parentElement}return getComputedStyle(document.body).backgroundColor})}
async function expectTextContrast(target:Locator,minimum=4.5){const foreground=await target.evaluate(element=>getComputedStyle(element).color),background=await effectiveBackground(target),label=await target.evaluate(element=>element.textContent?.trim()||element.tagName);expect(contrast(foreground,background),`${label} text contrast`).toBeGreaterThanOrEqual(minimum)}
async function expectBoundaryContrast(target:Locator,surface:Locator){const border=await target.evaluate(element=>getComputedStyle(element).borderColor),background=await effectiveBackground(surface),label=await target.getAttribute("aria-label")??await target.getAttribute("name")??"field";expect(contrast(border,background),`${label} boundary contrast`).toBeGreaterThanOrEqual(3)}
async function expectFocusContrast(target:Locator,surface:Locator){const style=await target.evaluate(element=>({color:getComputedStyle(element).outlineColor,width:getComputedStyle(element).outlineWidth,offset:getComputedStyle(element).outlineOffset})),background=await effectiveBackground(surface),label=await target.getAttribute("aria-label")??await target.getAttribute("name")??"focus";expect(Number.parseFloat(style.width),`${label} focus width`).toBeGreaterThanOrEqual(2);expect(Number.parseFloat(style.offset),`${label} focus offset`).toBeGreaterThanOrEqual(2);expect(contrast(style.color,background),`${label} focus contrast`).toBeGreaterThanOrEqual(3)}
async function assertIdentityContrast(page:Page){await expectTextContrast(page.getByRole("heading",{level:1}));for(const target of await page.locator(".field>span:first-child,.lead,.alert,.below").all())if(await target.isVisible())await expectTextContrast(target);for(const target of await page.locator(".field input").all())if(await target.isVisible())await expectBoundaryContrast(target,page.locator(".flow-card"));for(const target of await page.locator("button.primary,a.primary").all())if(await target.isVisible())await expectTextContrast(target)}
async function tabTo(page:Page,target:Locator){for(let index=0;index<30;index+=1){await page.keyboard.press("Tab");if(await target.evaluate(element=>element===document.activeElement).catch(()=>false))return}throw new Error("Keyboard traversal did not reach target")}

test.describe("Phase 4 identity deterministic visual evidence",()=>{
  test("P4-02 registration default and filled plan context matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();
      await gotoState(page,"/register?plan=growth&cadence=monthly",effective,"desktop");
      await expect(page.getByRole("heading",{name:"Create your company account"})).toBeVisible();
      await assertIdentityContrast(page);
      await capture(page,`spectrum-p4-registration-default-desktop-${effective}.png`);
      await fillRegistration(page);
      await capture(page,`spectrum-p4-registration-filled-desktop-${effective}.png`);
      for(const viewport of ["tablet","mobile320","zoom200"] as const){
        await gotoState(page,"/register?plan=growth&cadence=monthly",effective,viewport);await fillRegistration(page);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
        await capture(page,`spectrum-p4-registration-filled-${viewport}-${effective}.png`);
      }
    }
  });

  test("P4-03 registration validation matrix keeps focused summary and fields",async({page,context})=>{
    for(const effective of ["light","dark"] as const)for(const viewport of ["desktop","mobile390","mobile320","zoom200"] as const){
      await context.clearCookies();await gotoState(page,"/register?plan=growth&cadence=monthly",effective,viewport);
      await page.getByRole("button",{name:"Create account"}).click();
      const summary=page.locator(".error-summary");await expect(summary).toBeFocused();
      await expect(page.locator("#name")).toHaveAttribute("aria-invalid","true");await expect(page.locator("#email")).toHaveAttribute("aria-invalid","true");await expect(page.locator("#password")).toHaveAttribute("aria-invalid","true");
      await expectFocusContrast(summary,page.locator(".flow-card"));await assertIdentityContrast(page);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      await capture(page,`spectrum-p4-registration-invalid-${viewport}-${effective}.png`);
    }
  });

  test("P4-04 registration busy and network error matrix preserves safe input",async({page,context})=>{
    for(const effective of ["light","dark"] as const)for(const viewport of ["desktop","mobile320"] as const){
      await context.clearCookies();await gotoState(page,"/register?plan=growth&cadence=monthly",effective,viewport);await fillRegistration(page);
      let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
      await page.route("**/api/auth/register",async route=>{await gate;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false,code:"provider_unavailable"})})},{times:1});
      await page.getByRole("button",{name:"Create account"}).click();
      await expect(page.getByRole("button",{name:"Creating account…"})).toBeDisabled();
      await expect(page.locator("form")).toHaveAttribute("aria-busy","true");
      await capture(page,`spectrum-p4-registration-busy-${viewport}-${effective}.png`);
      release();await expect(page.getByRole("alert").filter({hasText:/^We couldn’t create your account\. Try again\.$/})).toBeVisible();
      await expect(page.getByLabel("Full name")).toHaveValue("Morgan Rivera");await expect(page.getByLabel("Work email")).toHaveValue("morgan.rivera@example.test");
      await assertIdentityContrast(page);await capture(page,`spectrum-p4-registration-network-error-${viewport}-${effective}.png`);await page.unroute("**/api/auth/register");
    }
  });

  test("P4-05 verification waiting checking and verified matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const)for(const viewport of ["desktop","mobile390"] as const){
      await context.clearCookies();await sessionEmail(page,null);await gotoState(page,"/verify-email",effective,viewport);
      await expect(page.getByRole("heading",{name:"Check your email"})).toBeVisible();await capture(page,`spectrum-p4-verification-waiting-${viewport}-${effective}.png`);

      await context.clearCookies();await verificationIntent(context);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
      await page.route("**/verify-email/complete",async route=>{await gate;await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true})})},{times:1});
      await gotoState(page,"/verify-email",effective,viewport);await expect(page.getByRole("heading",{name:"Verifying your email…"})).toBeVisible();await expect(page.getByRole("status")).toHaveAttribute("aria-live","polite");
      await capture(page,`spectrum-p4-verification-checking-${viewport}-${effective}.png`);
      release();await expect(page.getByRole("heading",{name:"Email verified"})).toBeVisible();await assertIdentityContrast(page);
      await capture(page,`spectrum-p4-verification-verified-${viewport}-${effective}.png`);await page.unroute("**/verify-email/complete");
    }
    for(const effective of ["light","dark"] as const){await context.clearCookies();await verificationIntent(context);await page.route("**/verify-email/complete",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true})}),{times:1});await gotoState(page,"/verify-email",effective,"mobile320");await expect(page.getByRole("heading",{name:"Email verified"})).toBeVisible();await capture(page,`spectrum-p4-verification-verified-mobile320-${effective}.png`);await page.unroute("**/verify-email/complete")}
  });

  test("P4-06 verification invalid resent and delivery-failure matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await invalidVerification(context);await gotoState(page,"/verify-email",effective,"desktop");await expect(page.getByRole("heading",{name:"This verification link is no longer valid"})).toBeVisible();await assertIdentityContrast(page);await capture(page,`spectrum-p4-verification-invalid-desktop-${effective}.png`);

      await context.clearCookies();await sessionEmail(page,"morgan.rivera@example.test");await page.route("**/api/auth/resend-verification",route=>route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({ok:true})}),{times:1});await gotoState(page,"/verify-email",effective,"desktop");await page.getByRole("button",{name:"Resend verification email"}).click();await expect(page.getByText(/replacement link was queued/)).toBeVisible();await capture(page,`spectrum-p4-verification-resent-desktop-${effective}.png`);await page.unroute("**/api/auth/resend-verification");

      await page.route("**/api/auth/resend-verification",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false})}),{times:1});await gotoState(page,"/verify-email",effective,"desktop");await page.getByRole("button",{name:"Resend verification email"}).click();await expect(page.getByText("Verification delivery is unavailable. Try again or return to registration.")).toBeVisible();await assertIdentityContrast(page);await capture(page,`spectrum-p4-verification-delivery-failure-desktop-${effective}.png`);await page.unroute("**/api/auth/resend-verification");

      await page.route("**/api/auth/resend-verification",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false})}),{times:1});await gotoState(page,"/verify-email",effective,"mobile320");await page.getByRole("button",{name:"Resend verification email"}).click();await expect(page.getByText("Verification delivery is unavailable. Try again or return to registration.")).toBeVisible();await capture(page,`spectrum-p4-verification-delivery-failure-mobile320-${effective}.png`);await page.unroute("**/api/auth/resend-verification");
    }
  });

  test("P4-07 login default invalid-credentials and session-expired matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      for(const viewport of ["desktop","tablet","mobile320"] as const){await context.clearCookies();await gotoState(page,"/login",effective,viewport);await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();if(viewport==="desktop")await assertIdentityContrast(page);await capture(page,`spectrum-p4-login-default-${viewport}-${effective}.png`)}
      for(const viewport of ["desktop","mobile320"] as const){await gotoState(page,"/login",effective,viewport);await fillLogin(page);await page.route("**/api/auth/login",route=>route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({ok:false,code:"invalid_credentials"})}),{times:1});await page.getByRole("button",{name:"Sign in"}).click();await expect(page.getByRole("alert").filter({hasText:/^The email or password is incorrect\.$/})).toBeVisible();await expect(page.getByLabel("Email")).toHaveValue("morgan.rivera@example.test");await capture(page,`spectrum-p4-login-invalid-credentials-${viewport}-${effective}.png`);await page.unroute("**/api/auth/login")}
      for(const viewport of ["desktop","mobile320"] as const){await gotoState(page,"/login?reason=session_expired",effective,viewport);await expect(page.getByText("Your session expired. Sign in again to continue.")).toBeVisible();await capture(page,`spectrum-p4-login-session-expired-${viewport}-${effective}.png`)}
      await gotoState(page,"/login",effective,"zoom200");const email=page.getByLabel("Email");await tabTo(page,email);await expect(email).toBeFocused();await expectFocusContrast(email,page.locator(".flow-card"));await capture(page,`spectrum-p4-login-focused-zoom200-${effective}.png`);
    }
  });

  test("P4-08 OIDC cancelled failure link-conflict and local-fixture matrix",async({page,context})=>{
    const states=[{name:"cancelled",url:"/login?oidc=cancelled",copy:"Google sign-in was cancelled. No changes were made."},{name:"failure",url:"/login?oidc=failed",copy:"Google sign-in couldn’t be completed. Try again or use email and password."},{name:"link-conflict",url:"/login?oidc=link_conflict",copy:"This Google account can’t be linked automatically. Sign in with your existing method or contact support."}] as const;
    for(const effective of ["light","dark"] as const){
      for(const state of states){await context.clearCookies();await gotoState(page,state.url,effective,"desktop");await expect(page.getByText(state.copy,{exact:true})).toBeVisible();await assertIdentityContrast(page);await capture(page,`spectrum-p4-oidc-${state.name}-desktop-${effective}.png`)}
      await gotoState(page,"/login",effective,"desktop");await expect(page.getByRole("link",{name:/Continue with local Google fixture/})).toBeVisible();await capture(page,`spectrum-p4-oidc-local-fixture-desktop-${effective}.png`);
      await gotoState(page,"/login?oidc=cancelled",effective,"mobile320");await expect(page.getByText(states[0].copy,{exact:true})).toBeVisible();await capture(page,`spectrum-p4-oidc-cancelled-mobile320-${effective}.png`);
    }
  });

  test("P4-08 OIDC disabled provider configuration pair",async({page,context})=>{
    test.skip(process.env.OIDC_MODE!=="disabled","Run this visual cell with OIDC_MODE=disabled against the same immutable candidate.");
    for(const effective of ["light","dark"] as const){await context.clearCookies();await gotoState(page,"/login",effective,"desktop");await expect(page.getByText("Google sign-in isn’t available in this environment. Use email and password.",{exact:true})).toBeVisible();await expect(page.getByRole("link",{name:/local Google fixture/})).toHaveCount(0);await capture(page,`spectrum-p4-oidc-disabled-desktop-${effective}.png`)}
  });

  test("P4-09 recovery default invalid busy success and service-failure matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await gotoState(page,"/forgot-password",effective,"desktop");await assertIdentityContrast(page);await capture(page,`spectrum-p4-recovery-default-desktop-${effective}.png`);
      await page.getByRole("button",{name:"Send reset link"}).click();await expect(page.locator(".error-summary")).toBeFocused();await capture(page,`spectrum-p4-recovery-invalid-desktop-${effective}.png`);

      await gotoState(page,"/forgot-password",effective,"desktop");await page.getByLabel("Email").fill("morgan.rivera@example.test");let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});await page.route("**/api/auth/reset-request",async route=>{await gate;await route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({ok:true})})},{times:1});await page.getByRole("button",{name:"Send reset link"}).click();await expect(page.getByRole("button",{name:"Submitting…"})).toBeDisabled();await capture(page,`spectrum-p4-recovery-busy-desktop-${effective}.png`);release();await expect(page.getByText("Check your email.")).toBeVisible();await expect(page.getByText(/If a matching active account exists/)).toBeVisible();await capture(page,`spectrum-p4-recovery-generic-success-desktop-${effective}.png`);await page.unroute("**/api/auth/reset-request");

      await gotoState(page,"/forgot-password",effective,"desktop");await page.getByLabel("Email").fill("morgan.rivera@example.test");await page.route("**/api/auth/reset-request",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false})}),{times:1});await page.getByRole("button",{name:"Send reset link"}).click();await expect(page.getByRole("alert").filter({hasText:/^The recovery service is unavailable\. Check your connection and try again\.$/})).toBeVisible();await expect(page.getByLabel("Email")).toHaveValue("morgan.rivera@example.test");await assertIdentityContrast(page);await capture(page,`spectrum-p4-recovery-service-failure-desktop-${effective}.png`);await page.unroute("**/api/auth/reset-request");

      await gotoState(page,"/forgot-password",effective,"mobile320");await page.getByRole("button",{name:"Send reset link"}).click();await capture(page,`spectrum-p4-recovery-invalid-mobile320-${effective}.png`);
      await gotoState(page,"/forgot-password",effective,"zoom200");const email=page.getByLabel("Email");await tabTo(page,email);await expectFocusContrast(email,page.locator(".flow-card"));await capture(page,`spectrum-p4-recovery-focused-zoom200-${effective}.png`);
    }
  });

  test("P4-10 reset valid validation invalid-link and success matrix",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      for(const viewport of ["desktop","mobile320"] as const){
        await context.clearCookies();await resetIntent(context);await gotoState(page,"/reset-password",effective,viewport);await expect(page.getByRole("heading",{name:"Choose a new password"})).toBeVisible();if(viewport==="desktop")await assertIdentityContrast(page);await capture(page,`spectrum-p4-reset-valid-${viewport}-${effective}.png`);
        await page.getByRole("button",{name:"Save new password"}).click();await expect(page.locator(".error-summary")).toBeFocused();await capture(page,`spectrum-p4-reset-validation-${viewport}-${effective}.png`);

        await context.clearCookies();await gotoState(page,"/reset-password",effective,viewport);await expect(page.getByRole("heading",{name:"This reset link is no longer valid"})).toBeVisible();await capture(page,`spectrum-p4-reset-invalid-link-${viewport}-${effective}.png`);

        await context.clearCookies();await resetIntent(context);await page.route("**/reset-password/complete",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true})}),{times:1});await gotoState(page,"/reset-password",effective,viewport);await fillReset(page);await page.getByRole("button",{name:"Save new password"}).click();await expect(page.getByText("Password updated. Existing sessions were revoked.",{exact:true})).toBeVisible();await capture(page,`spectrum-p4-reset-success-${viewport}-${effective}.png`);await page.unroute("**/reset-password/complete");
      }
      await context.clearCookies();await resetIntent(context);await gotoState(page,"/reset-password",effective,"zoom200");const password=page.locator("#password");await tabTo(page,password);await expect(password).toBeFocused();await expectFocusContrast(password,page.locator(".flow-card"));await capture(page,`spectrum-p4-reset-focused-zoom200-${effective}.png`);
    }
  });

  test("paired desktop identity states use the shared website experience",async({page,context})=>{
    await page.setViewportSize({width:1280,height:900});
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await theme(page,effective);
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("data-theme",effective);
      await capture(page,`phase4-login-${effective}-desktop.png`);

      await page.goto("/register?plan=growth&cadence=monthly");
      await page.getByRole("button",{name:"Create account"}).click();
      await expect(page.getByText("Please correct the following:")).toBeVisible();
      await page.locator(".error-summary").focus();
      await capture(page,`phase4-register-invalid-${effective}-desktop.png`);

      await context.clearCookies();await invalidVerification(context);
      await page.goto("/verify-email");
      await expect(page.getByRole("heading",{name:"This verification link is no longer valid"})).toBeVisible();
      await capture(page,`phase4-verification-invalid-${effective}-desktop.png`);

      await context.clearCookies();
      await page.goto("/verify-email");
      await expect(page.getByRole("heading",{name:"Check your email"})).toBeVisible();
      await capture(page,`phase4-verification-waiting-${effective}-desktop.png`);

      await page.goto("/forgot-password");
      await expect(page.getByRole("heading",{name:"Reset your password"})).toBeVisible();
      await capture(page,`phase4-recovery-${effective}-desktop.png`);

      await context.clearCookies();await resetIntent(context);
      await page.goto("/reset-password");
      await expect(page.getByRole("heading",{name:"Choose a new password"})).toBeVisible();
      await capture(page,`phase4-reset-${effective}-desktop.png`);
    }
  });

  test("paired 320px representatives reflow without horizontal overflow",async({page,context})=>{
    await page.setViewportSize({width:320,height:640});
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await theme(page,effective);
      await page.goto("/login");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      await capture(page,`phase4-login-${effective}-mobile-320.png`);

      await page.goto("/register?plan=growth&cadence=monthly");
      await page.getByRole("button",{name:"Create account"}).click();
      await page.locator(".error-summary").focus();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      await capture(page,`phase4-register-invalid-${effective}-mobile-320.png`);

      await context.clearCookies();await resetIntent(context);
      await page.goto("/reset-password");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      await capture(page,`phase4-reset-${effective}-mobile-320.png`);
    }
  });

  test("paired 640px zoom proxy preserves recovery and reset actions",async({page,context})=>{
    await page.setViewportSize({width:640,height:720});
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await theme(page,effective);
      await page.goto("/forgot-password");
      await page.getByLabel("Email").focus();
      await expect(page.getByRole("button",{name:"Send reset link"})).toBeVisible();
      await capture(page,`phase4-recovery-${effective}-zoom200.png`);

      await context.clearCookies();await resetIntent(context);
      await page.goto("/reset-password");
      await page.locator("#password").focus();
      await expect(page.getByRole("button",{name:"Save new password"})).toBeVisible();
      await capture(page,`phase4-reset-${effective}-zoom200.png`);
    }
  });

  test("anonymous System resolves effective Light and Dark on login",async({page,context})=>{
    for(const effective of ["light","dark"] as const){
      for(const viewport of ["desktop","tablet","mobile320"] as const){await context.clearCookies();await gotoState(page,"/login",effective,viewport);
        await expect(page.locator("html")).toHaveAttribute("data-theme-preference","system");
        await expect(page.locator("html")).toHaveAttribute("data-theme",effective);
        await capture(page,`spectrum-p4-login-system-${viewport}-${effective}.png`);
      }
    }
  });

  test("forced colours retains login and registration form boundaries",async({page,context})=>{
    await page.setViewportSize(viewports.desktop);await context.clearCookies();
    await page.emulateMedia({colorScheme:"light",forcedColors:"active",reducedMotion:"reduce"});
    await page.goto("/login");
    const email=page.getByLabel("Email");await tabTo(page,email);await expect(email).toBeFocused();await expect(email).toHaveCSS("outline-style","solid");
    await capture(page,"spectrum-p4-login-focus-forced-colors-desktop.png");

    await page.goto("/register?plan=growth&cadence=monthly");
    await page.getByRole("button",{name:"Create account"}).click();
    const summary=page.locator(".error-summary");await expect(summary).toBeFocused();await expect(page.locator("#email")).toHaveAttribute("aria-invalid","true");
    await expect(page.getByText("Please correct the following:")).toBeVisible();
    await capture(page,"spectrum-p4-registration-invalid-forced-colors-desktop.png");

    await page.setViewportSize(viewports.mobile320);await page.goto("/register?plan=growth&cadence=monthly");await page.getByRole("button",{name:"Create account"}).click();await expect(page.locator(".error-summary")).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await capture(page,"spectrum-p4-registration-invalid-forced-colors-mobile320.png");
  });
});
