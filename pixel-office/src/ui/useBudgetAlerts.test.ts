import { describe, expect, it } from "vitest";
import { crossed } from "./useBudgetAlerts";

describe("budget alerts", () => {
  it("crosses 80% and 100% of a real budget only", () => {
    expect(crossed(700, 1000)).toEqual([]);
    expect(crossed(800, 1000)).toEqual([0.8]);
    expect(crossed(1200, 1000)).toEqual([0.8, 1]);
    expect(crossed(5000, 0)).toEqual([]);
  });
});
