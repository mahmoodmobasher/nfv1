import { describe, expect, it } from "vitest";
import { activeSeatCopy } from "../src/app/marketing-seat-copy";

describe("homepage plan seat presentation", () => {
  it("uses singular only for one included active seat", () => {
    expect([1, 5, 15].map(activeSeatCopy)).toEqual([
      "One Workspace subscription includes 1 active seat, Owner included.",
      "One Workspace subscription includes 5 active seats, Owner included.",
      "One Workspace subscription includes 15 active seats, Owner included.",
    ]);
    expect(activeSeatCopy(1)).not.toContain("1 active seats");
  });
});
