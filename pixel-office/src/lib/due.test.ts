import { describe, expect, it } from "vitest";
import { daysUntil, dueLabel, dueState } from "./due";
import { dueReminders } from "../ui/useDueAlerts";

const now = new Date(2026, 9, 19, 15, 0); // Mon 19 Oct, 3pm local

describe("due dates", () => {
  it("counts calendar days, not hours", () => {
    expect(daysUntil("2026-10-19", now)).toBe(0);
    expect(daysUntil("2026-10-20", now)).toBe(1);
    expect(daysUntil("2026-10-16", now)).toBe(-3);
  });
  it("labels and classifies", () => {
    expect([dueState("2026-10-18", now), dueLabel("2026-10-18", now)]).toEqual(["overdue", "due yesterday"]);
    expect([dueState("2026-10-19", now), dueLabel("2026-10-19", now)]).toEqual(["today", "due today"]);
    expect(dueState("2026-10-21", now)).toBe("soon");
    expect(dueState("2026-11-30", now)).toBe("later");
    expect(dueLabel("2026-10-14", now)).toBe("5 days overdue");
  });
  it("reminds about open tasks due by tomorrow, most urgent first", () => {
    const issues = [
      { id: "a", status: "todo", identifier: "A", title: "a" },
      { id: "b", status: "done", identifier: "B", title: "b" },
      { id: "c", status: "in_progress", identifier: "C", title: "c" },
      { id: "d", status: "todo", identifier: "D", title: "d" },
    ] as never[];
    const due = { a: "2026-10-20", b: "2026-10-10", c: "2026-10-17", d: "2026-10-30" };
    expect(dueReminders(issues, due, now).map((x) => x.issue.id)).toEqual(["c", "a"]);
  });
});
