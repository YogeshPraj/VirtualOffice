import { describe, expect, it } from "vitest";
import { burst, justCompleted } from "./Confetti";

describe("celebrations", () => {
  it("only when a list becomes complete", () => {
    expect(justCompleted(false, 3, 3)).toBe(true);
    expect(justCompleted(null, 3, 3)).toBe(false); // first look: page load
    expect(justCompleted(true, 3, 3)).toBe(false); // already complete
    expect(justCompleted(false, 2, 3)).toBe(false);
    expect(justCompleted(false, 0, 0)).toBe(false);
  });
  it("scatters pieces across the screen, above it", () => {
    const p = burst(800, 50, () => 0.5);
    expect(p).toHaveLength(50);
    expect(p.every((x) => x.x === 400 && x.y < 0)).toBe(true);
  });
});
