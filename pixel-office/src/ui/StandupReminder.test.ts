import { describe, expect, it } from "vitest";
import { standupDue } from "./StandupReminder";

describe("stand-up reminder", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // 19 Oct 2026 is a Monday
  it("fires once on working mornings, within three hours of the start", () => {
    expect(standupDue(at(19, 8, 59), undefined, null)).toBe(false);
    expect(standupDue(at(19, 9, 0), undefined, null)).toBe(true);
    expect(standupDue(at(19, 11, 59), undefined, null)).toBe(true);
    expect(standupDue(at(19, 12, 0), undefined, null)).toBe(false);
    expect(standupDue(at(19, 9, 30), undefined, "2026-10-19")).toBe(false);
    expect(standupDue(at(18, 9, 30), undefined, null)).toBe(false); // Sunday
  });
  it("follows working hours when they are on", () => {
    const hours = { enabled: true, days: [0], start: "10:30" };
    expect(standupDue(at(18, 10, 45), hours, null)).toBe(true);
    expect(standupDue(at(19, 10, 45), hours, null)).toBe(false);
  });
});
