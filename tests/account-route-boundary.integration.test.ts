import { describe, expect, it } from "vitest";
import { GET as profile } from "../src/app/api/account/profile/route";
import { GET as preferences, PATCH as updatePreferences } from "../src/app/api/account/preferences/route";
import { POST as changePassword } from "../src/app/api/account/security/password/route";

const integration = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const origin = "http://127.0.0.1:3000";

integration("account route security boundary", () => {
  it("returns tenant-safe authentication failures with explicit private no-store", async () => {
    for (const response of [
      await profile(new Request(`${origin}/api/account/profile`)),
      await preferences(new Request(`${origin}/api/account/preferences`)),
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ ok: false, code: "authentication_required" });
    }
  });

  it("keeps early mutation denials private without opening account state", async () => {
    const requests = [
      updatePreferences(new Request(`${origin}/api/account/preferences`, { method: "PATCH", headers: { origin: "https://untrusted.invalid", "content-type": "application/json" }, body: JSON.stringify({ appearance: "dark", expectedVersion: 0 }) })),
      changePassword(new Request(`${origin}/api/account/security/password`, { method: "POST", headers: { origin: "https://untrusted.invalid", "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "x", newPassword: "y" }) })),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({ code: "request_rejected" });
    }
  });
});
