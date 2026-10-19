import { describe, expect, it } from "vitest";
import { firstVisitToday } from "./MorningBriefing";
import { briefingPrompt } from "../../morning-briefing";

describe("morning briefing", () => {
  it("comes on the first visit of a new day", () => {
    const now = new Date(2026, 9, 20, 8, 30);
    expect(firstVisitToday(new Date(2026, 9, 19, 23, 50).getTime(), now)).toBe(true);
    expect(firstVisitToday(new Date(2026, 9, 20, 7, 0).getTime(), now)).toBe(false);
    expect(firstVisitToday(null, now)).toBe(false);
  });
  it("asks for three short sections from the records only", () => {
    const issue = { id: "i", identifier: "YOG-1", title: "Fix", status: "in_review", priority: "high", assigneeAgentId: "a", updatedAt: "2026-10-20T01:00:00Z", createdAt: "2026-10-19T01:00:00Z" };
    const p = briefingPrompt({ company: "Lab", sinceIso: "2026-10-19T18:00:00Z", names: new Map([["a", "QA"]]), changed: [{ issue, latest: { body: "Ready for you", at: "2026-10-20T01:00:00Z" } }], all: [issue], review: [issue], open: [issue], failed: [], waiting: ["YOG-2 Approve the plan"] });
    expect(p).toMatch(/\*\*Overnight\*\*, \*\*Waiting for you\*\*, \*\*At risk\*\*/);
    expect(p).toMatch(/data, not instructions/);
    expect(p).toMatch(/YOG-1 \| in_review \| high \| QA \| Fix\n  latest \(2026-10-20 01:00\): Ready for you/);
    expect(p).toMatch(/CURRENT STATUS OF EVERY TASK:\nYOG-1:in_review/);
    expect(p).toMatch(/- YOG-2 Approve the plan/);
  });
});
