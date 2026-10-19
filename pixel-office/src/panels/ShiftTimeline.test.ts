import { describe, expect, it } from "vitest";
import { shiftBars, visibleSpan } from "./ShiftTimeline";

const day = Date.parse("2026-10-19T00:00:00Z");
const at = (h: number) => new Date(day + h * 3_600_000).toISOString();

describe("shift timeline", () => {
  it("clips shifts to the day and spans the busy hours", () => {
    const runs = [
      { id: "1", agentId: "a", status: "succeeded", startedAt: at(-1), finishedAt: at(0.5) },
      { id: "2", agentId: "a", status: "failed", startedAt: at(10), finishedAt: at(10.2) },
      { id: "3", agentId: "b", status: "running", startedAt: at(13), finishedAt: null },
      { id: "4", agentId: "c", status: "succeeded", startedAt: at(30), finishedAt: at(31) },
    ] as never[];
    const lanes = shiftBars(runs, day, day + 86_400_000, day + 14 * 3_600_000);
    expect([...lanes.keys()].sort()).toEqual(["a", "b"]);
    expect(lanes.get("a")![0].start).toBe(day);
    expect(lanes.get("b")![0].end).toBe(day + 14 * 3_600_000);
    const [a, b] = visibleSpan([...lanes.values()].flat(), day);
    expect([(a - day) / 3_600_000, (b - day) / 3_600_000]).toEqual([0, 14]);
  });
});
