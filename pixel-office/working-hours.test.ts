import { describe, expect, it } from "vitest";
import { inHours, nextChange, validSettings } from "./working-hours";

const at = (iso: string) => new Date(iso); // local time (no Z)

describe("working hours", () => {
  const office = validSettings({ enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" });

  it("knows a weekday office day", () => {
    expect(inHours(office, at("2026-10-19T08:59:00"))).toBe(false); // Monday
    expect(inHours(office, at("2026-10-19T09:00:00"))).toBe(true);
    expect(inHours(office, at("2026-10-19T17:59:00"))).toBe(true);
    expect(inHours(office, at("2026-10-19T18:00:00"))).toBe(false);
    expect(inHours(office, at("2026-10-18T12:00:00"))).toBe(false); // Sunday
  });

  it("handles an overnight shift", () => {
    const night = validSettings({ enabled: true, days: [5], start: "22:00", end: "06:00" });
    expect(inHours(night, at("2026-10-23T23:00:00"))).toBe(true); // Friday night
    expect(inHours(night, at("2026-10-24T05:59:00"))).toBe(true); // Saturday early = Friday's shift
    expect(inHours(night, at("2026-10-24T23:00:00"))).toBe(false); // Saturday night
  });

  it("finds the next opening", () => {
    expect(nextChange(office, at("2026-10-17T20:00:00"))?.getTime()).toBe(at("2026-10-19T09:00:00").getTime()); // Sat → Mon 09:00
  });

  it("rejects bad settings", () => {
    expect(() => validSettings({ start: "09:00", end: "09:00" })).toThrow();
    expect(validSettings({ days: [9, 1, 1], start: "25:00" })).toMatchObject({ days: [1], start: "09:00" });
  });
});
