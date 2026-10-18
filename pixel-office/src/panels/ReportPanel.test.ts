import { describe, expect, it } from "vitest";
import { dayRange } from "./ReportPanel";

describe("report periods", () => {
  const sun = new Date("2026-10-18T19:00:00"); // a Sunday
  it("weeks run Monday to Sunday", () => {
    const [a, b] = dayRange("week", sun);
    expect(new Date(a).getDay()).toBe(1);
    expect(new Date(a).getDate()).toBe(12);
    expect(b - a).toBe(7 * 86_400_000);
    expect(new Date(dayRange("lastweek", sun)[0]).getDate()).toBe(5);
  });
  it("days are midnight to midnight", () => {
    const [a, b] = dayRange("yesterday", sun);
    expect(new Date(a).getDate()).toBe(17);
    expect(b - a).toBe(86_400_000);
  });
});
