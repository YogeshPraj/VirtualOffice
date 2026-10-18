import { describe, expect, it } from "vitest";
import { goalProgress } from "./GoalPoster";

describe("goal progress", () => {
  it("counts linked tasks, ignoring cancelled ones", () => {
    const issues = [
      { goalId: "g", status: "done" },
      { goalId: "g", status: "in_progress" },
      { goalId: "g", status: "cancelled" },
      { goalId: "other", status: "done" },
    ] as never[];
    expect(goalProgress("g", issues)).toEqual({ done: 1, total: 2, pct: 50 });
    expect(goalProgress("none", issues)).toEqual({ done: 0, total: 0, pct: 0 });
    expect(goalProgress("main", [{ goalId: null, status: "done" }, { goalId: "main", status: "todo" }] as never[], true)).toEqual({ done: 1, total: 2, pct: 50 });
  });
});

import { defaultGoalId } from "./GoalPoster";

describe("main goal", () => {
  const g = (id: string, createdAt: string, status = "active", level = "company", parentId: string | null = null) => ({ id, createdAt, status, level, parentId });
  it("is the oldest active top-level company goal", () => {
    expect(defaultGoalId([g("b", "2026-02"), g("a", "2026-01", "achieved"), g("c", "2026-01", "active", "team")])).toBe("b");
    expect(defaultGoalId([g("a", "2026-01", "cancelled")])).toBe("a");
    expect(defaultGoalId([])).toBeNull();
  });
});
