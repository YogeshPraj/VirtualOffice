import { describe, expect, it } from "vitest";
import { sizeStats } from "./sizes";

const min = 60_000;
describe("size vs actual", () => {
  it("gives the median time per size and flags tasks that ran like a bigger one", () => {
    const r = (id: string, size: "S" | "M" | "L", m: number) => ({ id, identifier: id, title: id, size, ms: m * min });
    const { stats, longer } = sizeStats([r("a", "S", 10), r("b", "S", 20), r("c", "S", 90), r("d", "M", 60), r("e", "M", 80), r("f", "L", 200)]);
    expect(stats.map((s) => [s.size, s.count, s.median / min])).toEqual([["S", 3, 20], ["M", 2, 70], ["L", 1, 200]]);
    expect(longer.map((x) => x.id)).toEqual(["c"]);
  });
  it("copes with sizes nobody used", () => {
    expect(sizeStats([]).stats.every((s) => s.count === 0)).toBe(true);
  });
});
