import { describe, expect, it } from "vitest";
import { costLine, duration } from "./TaskCost";

const base = { issueCount: 1, costCents: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runCount: 4, runtimeMs: 1_277_162 };

describe("task cost", () => {
  it("formats durations", () => {
    expect(duration(20_000)).toBe("under a minute");
    expect(duration(21 * 60_000)).toBe("21 min");
    expect(duration(120 * 60_000)).toBe("2 h");
    expect(duration(135 * 60_000)).toBe("2 h 15 min");
  });
  it("says what the shifts cost", () => {
    expect(costLine(base)).toBe("4 shifts · 21 min of work · no metered cost (subscription)");
    expect(costLine({ ...base, runCount: 1, costCents: 123, inputTokens: 70_000, outputTokens: 10_000, issueCount: 3 })).toBe(
      "1 shift · 21 min of work · $1.23 · 80k tokens · incl. 2 sub-tasks",
    );
    expect(costLine({ ...base, runCount: 0 })).toBeNull();
    expect(costLine(undefined)).toBeNull();
  });
});
