import { describe, expect, it } from "vitest";
import { briefing } from "./SinceAway";

const since = Date.parse("2026-10-18T08:00:00Z");
const t = (h: number) => new Date(since + h * 3_600_000).toISOString();

describe("since you were away", () => {
  it("counts only what happened after you left", () => {
    const issues = [
      { id: "1", status: "done", completedAt: t(2), updatedAt: t(2), createdAt: t(-10) },
      { id: "2", status: "done", completedAt: t(-1), updatedAt: t(-1), createdAt: t(-10) },
      { id: "3", status: "in_review", updatedAt: t(1), createdAt: t(0.5) },
      { id: "4", status: "todo", updatedAt: t(3), createdAt: t(3), workMode: "ask" },
    ] as never[];
    const runs = [
      { status: "failed", finishedAt: t(1), error: "boom" },
      { status: "failed", finishedAt: t(1), error: "Issue is blocked by unresolved blockers" },
      { status: "succeeded", finishedAt: t(1) },
    ] as never[];
    const b = briefing(since, issues, [{ createdAt: t(4) }, { createdAt: t(-4) }] as never[], runs);
    expect(b.done.map((i) => i.id)).toEqual(["1"]);
    expect(b.created.map((i) => i.id)).toEqual(["3"]);
    expect(b.review.map((i) => i.id)).toEqual(["3"]);
    expect(b.waiting).toHaveLength(1);
    expect(b.failed).toHaveLength(1);
  });
});
