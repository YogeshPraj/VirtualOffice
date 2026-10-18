import { describe, expect, it } from "vitest";
import { cycleMs, cycleSummary, firstStarts, median, scorecard } from "./stats";

const H = 3_600_000;
const base = Date.parse("2026-10-18T00:00:00Z");
const t = (h: number) => new Date(base + h * H).toISOString();

describe("team stats", () => {
  it("measures cycle time from start (or creation) to done", () => {
    expect(cycleMs({ status: "done", startedAt: t(1), completedAt: t(4), createdAt: t(0) })).toBe(3 * H);
    expect(cycleMs({ status: "done", startedAt: null, completedAt: t(2), createdAt: t(0) })).toBe(2 * H);
    expect(cycleMs({ status: "todo", startedAt: t(1), completedAt: null, createdAt: t(0) })).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // A restarted task counts from when work first began, not its last restart.
    const starts = firstStarts([
      { entityId: "r", createdAt: t(1), action: "issue.updated", details: { changes: { status: { to: "in_progress" } } } },
      { entityId: "r", createdAt: t(20), action: "issue.updated", details: { changes: { status: { to: "in_progress" } } } },
    ] as never[]);
    expect(cycleMs({ id: "r", status: "done", startedAt: t(20), completedAt: t(21), createdAt: t(0) }, starts)).toBe(20 * H);
  });

  it("scores an employee", () => {
    const issues = [
      { id: "a", assigneeAgentId: "x", status: "done", startedAt: t(0), completedAt: t(2), createdAt: t(0) },
      { id: "b", assigneeAgentId: "x", status: "in_progress", createdAt: t(0) },
      { id: "c", assigneeAgentId: "y", status: "done", startedAt: t(0), completedAt: t(9), createdAt: t(0) },
    ] as never[];
    const runs = [
      { agentId: "x", status: "succeeded", startedAt: t(1) },
      { agentId: "x", status: "failed", startedAt: t(1), error: "quota" },
      { agentId: "x", status: "failed", startedAt: t(1), error: "Issue is blocked by unresolved blockers" },
    ] as never[];
    const activity = [{ entityId: "a", createdAt: t(1), action: "issue.updated", details: { changes: { status: { from: "in_review", to: "in_progress" } } } }] as never[];
    const s = scorecard("x", issues, runs, activity, base - H);
    expect(s).toMatchObject({ done: 1, medianCycleMs: 2 * H, shifts: 3, failedShifts: 1, bounces: 1, open: 1 });
    expect(cycleSummary(issues, base, base + 24 * H).slowest[0].issue.id).toBe("c");
  });
});
