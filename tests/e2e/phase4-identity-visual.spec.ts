import { expect,test,type BrowserContext,type Page } from "playwright/test";
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

test.describe("Phase 4 identity deterministic visual evidence",()=>{
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
    await page.setViewportSize({width:1280,height:900});
    for(const effective of ["light","dark"] as const){
      await context.clearCookies();await theme(page,effective);await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("data-theme-preference","system");
      await expect(page.locator("html")).toHaveAttribute("data-theme",effective);
      await capture(page,`phase4-login-system-${effective}.png`);
    }
  });

  test("forced colours retains login and registration form boundaries",async({page,context})=>{
    await page.setViewportSize({width:1280,height:900});await context.clearCookies();
    await page.emulateMedia({colorScheme:"light",forcedColors:"active",reducedMotion:"reduce"});
    await page.goto("/login");
    await page.keyboard.press("Tab");await page.keyboard.press("Tab");await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    await capture(page,"phase4-login-forced-colors.png");

    await page.goto("/register?plan=growth&cadence=monthly");
    await page.getByRole("button",{name:"Create account"}).click();
    await page.locator(".error-summary").focus();
    await expect(page.getByText("Please correct the following:")).toBeVisible();
    await capture(page,"phase4-register-invalid-forced-colors.png");
  });
});
