import { describe, expect, it } from "vitest";
import type { IssueStatus } from "../api/types";
import { reviewDue, weekOf, weekSummary } from "./WeeklyReview";

describe("weekly review", () => {
  it("is due from Friday 3 pm until the week is reviewed", () => {
    const fri = new Date(2026, 9, 23, 16, 0); // Fri 23 Oct 2026
    expect(weekOf(fri)).toBe("2026-10-19");
    expect(reviewDue(new Date(2026, 9, 23, 10, 0), null)).toBe(false);
    expect(reviewDue(fri, null)).toBe(true);
    expect(reviewDue(new Date(2026, 9, 25, 9, 0), null)).toBe(true); // Sunday, same week
    expect(reviewDue(fri, "2026-10-19")).toBe(false);
    expect(reviewDue(new Date(2026, 9, 21, 16, 0), null)).toBe(false); // Wednesday
  });
  it("sums up the week by person, and finds stale work", () => {
    const now = Date.parse("2026-10-23T15:00:00Z");
    const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
    const t = (n: number, who: string | null, status: IssueStatus, days: number) => ({
      id: `i${n}`,
      identifier: `YOG-${n}`,
      title: `T${n}`,
      status,
      assigneeAgentId: who,
      completedAt: ago(days),
      updatedAt: ago(days),
    });
    const s = weekSummary(
      [t(1, "a", "done", 1), t(2, "a", "done", 2), t(3, "b", "done", 3), t(4, "b", "done", 9), t(5, "a", "todo", 10)],
      [
        { id: "a", name: "Ada" },
        { id: "b", name: "QA" },
      ],
      now,
    );
    expect(s.shipped).toBe(3);
    expect(s.byPerson.map((p) => [p.who, p.list.length])).toEqual([
      ["Ada", 2],
      ["QA", 1],
    ]);
    expect(s.stale.map((x) => x.issue.identifier)).toEqual(["YOG-5"]);
  });
});
