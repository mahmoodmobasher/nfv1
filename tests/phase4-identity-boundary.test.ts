import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path:string):string {
  return readFileSync(new URL(path,import.meta.url),"utf8");
}

describe("Phase 4 identity presentation boundary",()=>{
  it("attaches every identity route to the server-rendered website shell",()=>{
    for(const file of [
      "../src/app/login/page.tsx",
      "../src/app/register/page.tsx",
      "../src/app/forgot-password/page.tsx",
      "../src/app/reset-password/page.tsx",
      "../src/app/verify-email/page.tsx",
    ]){
      const page=source(file);
      expect(page,file).toContain("WebsiteShell");
      expect(page,file).not.toContain('"use client"');
    }
    expect(source("../src/app/onboarding/website-shell.tsx")).toContain("experience-website");
  });

  it("uses provider configuration without exposing a production fixture action",()=>{
    const provider=source("../src/app/onboarding/provider.ts");
    const components=source("../src/app/onboarding/components.tsx");
    expect(provider).toContain('env.OIDC_MODE === "fixture" && env.NODE_ENV !== "production"');
    expect(components).toContain('mode==="fixture"');
    expect(components).toContain("Google sign-in isn’t available in this environment");
  });

  it("honors the server login destination with an internal fallback",()=>{
    const forms=source("../src/app/onboarding/forms.tsx");
    expect(forms).toContain('payload.next.startsWith("/")');
    expect(forms).toContain('!payload.next.startsWith("//")');
    expect(forms).toContain('window.location.replace(destination)');
    expect(forms).not.toContain('window.location.href = "/workspace/create"');
  });

  it("keeps recovery enumeration-safe and removes unpublished consent",()=>{
    const forms=source("../src/app/onboarding/forms.tsx");
    expect(forms).toContain("If a matching active account exists, a recovery message was queued.");
    expect(forms).toContain("Password updated. Existing sessions were revoked.");
    expect(forms).not.toMatch(/I agree to the Terms|required.*terms/i);
  });

  it("keeps raw identity tokens out of Client Components and browser storage",()=>{
    const verify=source("../src/app/verify-email/verify-client.tsx");
    const reset=source("../src/app/onboarding/forms.tsx");
    expect(verify).toContain('securePost("/verify-email/complete",{})');
    expect(reset).toContain('securePost("/reset-password/complete",{password})');
    expect(verify).not.toMatch(/\btoken\b/);
    expect(reset).not.toMatch(/ResetForm\(\{token\}|password\/complete",\{token/);
    expect(verify).not.toMatch(/(?:local|session)Storage\.setItem\([^)]*token/i);
    expect(reset).not.toMatch(/(?:local|session)Storage\.setItem\([^)]*token/i);
  });
});
