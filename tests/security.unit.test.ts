import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { decryptEnvelope, encryptEnvelope, keyedHash, randomOpaqueToken } from "../src/server/security/crypto";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../src/server/security/password";
import { assertTrustedMutation, CSRF_COOKIE } from "../src/server/security/request";
import { meetsPasswordPolicy } from "../src/shared/password-policy";

describe("Slice 2 security primitives", () => {
  it("creates opaque tokens and deterministic keyed hashes", () => { const token=randomOpaqueToken(); expect(token.length).toBeGreaterThan(40); expect(keyedHash(token,"secret")).not.toContain(token); });
  it("encrypts authenticated outbox envelopes", () => { const encrypted=encryptEnvelope({token:"raw-secret"},"secret"); expect(encrypted).not.toContain("raw-secret"); expect(decryptEnvelope(encrypted,"secret")).toEqual({token:"raw-secret"}); expect(()=>decryptEnvelope(encrypted,"wrong")).toThrow(); });
  it("hashes and verifies with Argon2id and detects weaker hashes", async () => { const hash=await hashPassword("Local-password-123!"); expect(hash).toContain("argon2id"); expect(await verifyPassword(hash,"Local-password-123!")).toBe(true); expect(await verifyPassword(hash,"wrong")).toBe(false); const weak=await argon2.hash("Local-password-123!",{type:argon2.argon2id,memoryCost:4096,timeCost:1}); expect(passwordNeedsRehash(weak)).toBe(true); });
  it("requires matching CSRF and trusted Origin or Referer", () => { const valid=new Request("http://127.0.0.1:3000/api",{method:"POST",headers:{origin:"http://127.0.0.1:3000",cookie:`${CSRF_COOKIE}=token`,"x-csrf-token":"token"}}); expect(()=>assertTrustedMutation(valid,"http://127.0.0.1:3000")).not.toThrow(); const cross=new Request("http://127.0.0.1:3000/api",{method:"POST",headers:{origin:"https://evil.example",cookie:`${CSRF_COOKIE}=token`,"x-csrf-token":"token"}}); expect(()=>assertTrustedMutation(cross,"http://127.0.0.1:3000")).toThrow("untrusted_origin"); const missing=new Request("http://127.0.0.1:3000/api",{method:"POST",headers:{origin:"http://127.0.0.1:3000"}}); expect(()=>assertTrustedMutation(missing,"http://127.0.0.1:3000")).toThrow("csrf_invalid"); });
  it("centralizes length, number, and symbol password requirements", () => { expect(meetsPasswordPolicy("Long-enough-123!")).toBe(true); expect(meetsPasswordPolicy("abcdefghijkl")).toBe(false); expect(meetsPasswordPolicy("abcdefghijkl!")).toBe(false); expect(meetsPasswordPolicy("abcdefghijkl1")).toBe(false); });
});
