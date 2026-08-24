import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { GET as captureVerification } from "../src/app/verify-email/capture/route";
import { GET as captureReset } from "../src/app/reset-password/capture/route";
import { POST as verify } from "../src/app/api/auth/verify/route";
import { POST as resetComplete } from "../src/app/api/auth/reset-complete/route";
import { IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS, clearIdentityTokenIntentCookie, identityTokenIntentCookie, identityTokenIntentSettings, openIdentityTokenIntent, sealIdentityTokenIntent } from "../src/server/identity/token-intent";

const secret="phase-four-identity-intent-secret-32-characters",token="identity-token-value-long-enough-123456789";
const mutationHeaders={origin:"http://127.0.0.1:3000",cookie:"nexaflow_csrf=csrf-token","x-csrf-token":"csrf-token","content-type":"application/json"};

describe("Phase 4 identity token intent boundary",()=>{
  it("seals purpose-bound short-lived tokens and rejects expiry, tampering, and cross-purpose use",()=>{
    const now=Date.now(),sealed=sealIdentityTokenIntent("email_verification",token,secret,now);
    expect(sealed).not.toContain(token);
    expect(openIdentityTokenIntent("email_verification",sealed,secret,now+(IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS-1)*1000)).toBe(token);
    expect(openIdentityTokenIntent("email_verification",sealed,secret,now+(IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS+1)*1000)).toBeNull();
    expect(openIdentityTokenIntent("password_reset",sealed,secret,now)).toBeNull();
    expect(openIdentityTokenIntent("email_verification",`${sealed}tampered`,secret,now)).toBeNull();
  });

  it("uses encrypted HttpOnly, SameSite, API-path-scoped cookies with exact expiry cleanup",()=>{
    for(const purpose of ["email_verification","password_reset"] as const){
      const {cookie,path}=identityTokenIntentSettings(purpose),set=identityTokenIntentCookie(purpose,"sealed",true),cleared=clearIdentityTokenIntentCookie(purpose,true);
      for(const value of [set,cleared]){expect(value).toContain(`${cookie}=`);expect(value).toContain(`Path=${path}`);expect(value).toContain("HttpOnly");expect(value).toContain("SameSite=Lax");expect(value).toContain("; Secure")}
      expect(set).toContain("Max-Age=900");expect(cleared).toContain("Max-Age=0");
    }
  });

  it("captures through same-origin Route Handler redirects without reflecting raw tokens",()=>{
    for(const [capture,path,cookie] of [[captureVerification,"verify-email","nexaflow_email_verification_intent"],[captureReset,"reset-password","nexaflow_password_reset_intent"]] as const){
      const response=capture(new Request(`http://127.0.0.1:3000/${path}/capture?token=${token}`));
      expect(response.status).toBe(303);expect(response.headers.get("location")).toBe(`http://127.0.0.1:3000/${path}`);expect(response.headers.get("location")).not.toContain(token);
      expect(response.headers.get("set-cookie")).toContain(`${cookie}=`);expect(response.headers.get("set-cookie")).not.toContain(token);
      expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("replaces stale authority on invalid and missing capture while keeping redirects token-free",()=>{
    for(const [capture,path,purpose] of [[captureVerification,"verify-email","email_verification"],[captureReset,"reset-password","password_reset"]] as const){
      for(const suffix of ["", "?token=short"]){const response=capture(new Request(`http://127.0.0.1:3000/${path}/capture${suffix}`,{headers:{cookie:`${identityTokenIntentSettings(purpose).cookie}=previous-valid-intent`}}));expect(response.headers.get("location")).toBe(`http://127.0.0.1:3000/${path}`);expect(response.headers.get("set-cookie")).toContain(`${identityTokenIntentSettings(purpose).cookie}=invalid`);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer")}
    }
  });

  it("clears browser intents on terminal malformed outcomes",async()=>{
    const verification=await verify(new Request("http://127.0.0.1:3000/api/auth/verify",{method:"POST",headers:mutationHeaders,body:"{}"}));
    const reset=await resetComplete(new Request("http://127.0.0.1:3000/api/auth/reset-complete",{method:"POST",headers:mutationHeaders,body:JSON.stringify({password:"weak"})}));
    for(const response of [verification,reset]){expect(response.status).toBe(400);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("set-cookie")).toContain("Max-Age=0")}
  });

  it("retains direct body-token compatibility while generated links enter capture handlers",()=>{
    const verifyRoute=readFileSync(new URL("../src/app/api/auth/verify/route.ts",import.meta.url),"utf8"),resetRoute=readFileSync(new URL("../src/app/api/auth/reset-complete/route.ts",import.meta.url),"utf8"),service=readFileSync(new URL("../src/server/identity/service.ts",import.meta.url),"utf8");
    expect(verifyRoute).toContain('intentToken??(body as{token?:unknown}|null)?.token');
    expect(resetRoute).toContain("intentToken??submitted.token");
    expect(service).toContain('"/verify-email/capture?token="');expect(service).toContain('"/reset-password/capture?token="');
  });
});
