import { describe, expect, it } from "vitest";
import { chainLayout } from "./BlockerChains";

describe("waiting chains", () => {
  it("puts each task after what it waits on, and counts what it frees", () => {
    // A blocks B and C; B blocks D. So A frees 3, B frees 1.
    const l = chainLayout([
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "D" },
    ]);
    expect([..."ABCD"].map((id) => l.depth.get(id))).toEqual([0, 1, 1, 2]);
    expect([..."ABCD"].map((id) => l.frees.get(id))).toEqual([3, 1, 0, 0]);
    expect(l.row.get("B")).toBe(0); // frees more, so it goes above C
  });
  it("survives a cycle", () => {
    const l = chainLayout([
      { from: "X", to: "Y" },
      { from: "Y", to: "X" },
    ]);
    expect(l.ids.sort()).toEqual(["X", "Y"]);
    expect(l.frees.get("X")).toBe(1);
  });
});
