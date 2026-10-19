import { describe, expect, it } from "vitest";
import { decorFor } from "./SeasonalDecor";

const on = (y: number, m: number, d: number) => decorFor(new Date(y, m - 1, d));

describe("seasonal décor", () => {
  it("follows the seasons", () => {
    expect(on(2026, 4, 10)).toEqual(["spring"]);
    expect(on(2026, 7, 10)).toEqual(["summer"]);
    expect(on(2026, 10, 19)).toEqual(["autumn"]);
    expect(on(2026, 2, 10)).toEqual(["winter"]);
  });
  it("adds festivals around their dates", () => {
    expect(on(2026, 10, 30)).toContain("halloween");
    expect(on(2026, 11, 6)).toContain("diwali");
    expect(on(2026, 11, 10)).toContain("diwali");
    expect(on(2026, 11, 12)).not.toContain("diwali");
    expect(on(2026, 12, 24)).toEqual(["winter", "holidays"]);
    expect(on(2026, 12, 31)).toContain("new-year");
    expect(on(2027, 1, 5)).toContain("holidays");
    expect(on(2027, 1, 7)).toEqual(["winter"]);
  });
});
