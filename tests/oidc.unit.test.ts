import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv } from "../src/server/env";
import { beginOidc } from "../src/server/identity/oidc";
import { GET as fixture } from "../src/app/api/auth/oidc/fixture/route";
const original={...process.env};
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original)});
const production={NODE_ENV:"production",DATABASE_URL:"postgres://app:x@db.example.invalid/app",SESSION_COOKIE_NAME:"s",SESSION_SECRET:"production-session-secret-more-than-32-characters",EMAIL_PROVIDER:"resend",RESEND_API_KEY:"not-a-real-resend-credential",EMAIL_FROM:"NexaFlow accounts <accounts@mail.nexaflowsystems.com>",APP_ORIGIN:"https://app.example.invalid",SESSION_IDLE_MINUTES:"30",SESSION_ABSOLUTE_HOURS:"24",SESSION_TOUCH_INTERVAL_SECONDS:"60",TRUSTED_PROXY_ENABLED:"false",OIDC_FIXTURE_SECRET:"production-fixture-secret-more-than-32-characters",OIDC_REDIRECT_URIS:"https://app.example.invalid/api/auth/oidc/callback"};
describe("OIDC fixture boundary",()=>{
  it("fails production configuration closed when fixture mode is enabled",()=>expect(()=>getServerEnv({...production,OIDC_MODE:"fixture"})).toThrow(/Fixture OIDC/));
  it("rejects a redirect not in the exact allowlist before persistence",async()=>{const fake={query:()=>{throw new Error("database_touched")}};await expect(beginOidc(fake as never,{secret:"x".repeat(32),redirectUri:"https://evil.example/callback",allowedRedirectUris:["http://127.0.0.1:3000/api/auth/oidc/callback"]})).rejects.toMatchObject({code:"invalid_protocol"})});
  it("returns not found when fixture mode is disabled",async()=>{Object.assign(process.env,{...production,OIDC_MODE:"disabled"});expect((await fixture(new Request("https://app.example.invalid/api/auth/oidc/fixture"))).status).toBe(404)});
});
