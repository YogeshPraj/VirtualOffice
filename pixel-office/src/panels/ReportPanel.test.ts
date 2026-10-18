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

import { toMarkdown } from "./ReportPanel";

describe("report markdown", () => {
  it("turns the stand-up text into headings and bullets", () => {
    const md = toMarkdown("Lab: today at the office (Sun)\n\nDone (1):\n  - YOG-1 Ship (Ada)\nBlocked (0):\n  - none\n\nNew tasks: 2");
    expect(md).toBe("# Lab: today at the office (Sun)\n\n## Done (1)\n- YOG-1 Ship (Ada)\n\n## Blocked (0)\n- none\n\nNew tasks: 2\n");
  });
});
