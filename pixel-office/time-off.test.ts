import { describe, expect, it } from "vitest";
import { dueBack, validLeave } from "./time-off";

describe("time off", () => {
  it("accepts a return day after today, within a year", () => {
    expect(validLeave("2026-10-24", "2026-10-19")).toBeNull();
    expect(validLeave("2026-10-19", "2026-10-19")).toMatch(/after today/);
    expect(validLeave("2027-11-01", "2026-10-19")).toMatch(/year/);
    expect(validLeave("next week", "2026-10-19")).toMatch(/Pick/);
  });
  it("brings people back on their return day, or later if the office was off", () => {
    const leave = { a: { until: "2026-10-19", reason: null, since: "" }, b: { until: "2026-10-20", reason: null, since: "" }, c: { until: "2026-10-01", reason: null, since: "" } };
    expect(dueBack(leave, "2026-10-19").sort()).toEqual(["a", "c"]);
  });
});
