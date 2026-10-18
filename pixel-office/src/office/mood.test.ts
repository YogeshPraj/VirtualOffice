import { describe, expect, it } from "vitest";
import { moodFor } from "./mood";

const open = { settings: { enabled: true }, now: { inHours: true, nextChange: null } };
const after = { settings: { enabled: true }, now: { inHours: false, nextChange: "2026-10-19T08:00:00.000Z" } };
const noon = new Date("2026-10-18T12:00:00");
const late = new Date("2026-10-18T22:00:00");

describe("office mood", () => {
  it("is night when closed or after hours", () => {
    expect(moodFor({ status: "paused" }, open, noon)).toMatchObject({ mood: "night", why: "The office is closed" });
    expect(moodFor({ status: "active" }, after, noon)).toMatchObject({ mood: "night", why: "After hours", reopens: after.now.nextChange });
  });
  it("is dusk late in the evening, day otherwise", () => {
    expect(moodFor({ status: "active" }, undefined, late).mood).toBe("dusk");
    expect(moodFor({ status: "active" }, { ...after, settings: { enabled: false } }, noon).mood).toBe("day");
  });
});
