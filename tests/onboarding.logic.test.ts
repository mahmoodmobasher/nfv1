import { describe, expect, it } from "vitest";
import { clearDemoState, query, selection, validEmail, validPassword } from "../src/app/onboarding/logic";

describe("plan and cadence normalization", () => {
  it("defaults missing or invalid values to Growth monthly", () => {
    expect(selection(new URLSearchParams())).toEqual({ plan: "growth", cadence: "monthly" });
    expect(selection(new URLSearchParams("plan=unknown&cadence=weekly"))).toEqual({ plan: "growth", cadence: "monthly" });
  });

  it("keeps supported plan and annual cadence", () => {
    expect(selection(new URLSearchParams("plan=scale&cadence=annual"))).toEqual({ plan: "scale", cadence: "annual" });
    expect(query("essentials", "monthly")).toBe("plan=essentials&cadence=monthly");
  });
});

describe("provider-independent form validation", () => {
  it("accepts the current email shape and rejects malformed values", () => {
    expect(validEmail("person@example.com")).toBe(true);
    expect(validEmail("not-an-email")).toBe(false);
  });

  it("enforces the current password requirements", () => {
    expect(validPassword("long-enough1!")).toBe(true);
    expect(validPassword("short1!")).toBe(false);
    expect(validPassword("long-enough-password")).toBe(false);
  });
});

describe("demo logout state", () => {
  it("removes only NexaFlow demo keys", () => {
    const values = new Map([["nexaDemoSession", "active"], ["nexaDemoWorkspace", "Acme"], ["otherKey", "keep"]]);
    const storage = {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
    };
    clearDemoState(storage);
    expect([...values.entries()]).toEqual([["otherKey", "keep"]]);
  });
});
