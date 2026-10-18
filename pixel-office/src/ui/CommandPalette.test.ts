import { describe, expect, it } from "vitest";
import { score } from "./CommandPalette";

describe("palette score", () => {
  it("requires every word and prefers prefix matches", () => {
    expect(score("YOG-17 Validate Redis atomics", "redis yog")).toBeGreaterThanOrEqual(0);
    expect(score("YOG-17 Validate Redis atomics", "kafka")).toBe(-1);
    expect(score("Manager", "man")).toBeLessThan(score("Ada · Woman engineer", "man"));
  });
});
