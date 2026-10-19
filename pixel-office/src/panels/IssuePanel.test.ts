import { describe, expect, it } from "vitest";
import { visibleThread } from "./IssuePanel";

const c = (n: number, agent: boolean) => ({ id: String(n), authorAgentId: agent ? "a" : null });

describe("long threads", () => {
  it("folds older comments and filters by author", () => {
    const thread = Array.from({ length: 12 }, (_, i) => c(i, i % 3 !== 0));
    const r = visibleThread(thread, "all", 6);
    expect([r.items[0].id, r.hidden]).toEqual(["6", 6]);
    expect(visibleThread(thread, "me", 6)).toMatchObject({ hidden: 0 });
    expect(visibleThread(thread, "me", 6).items.map((x) => x.id)).toEqual(["0", "3", "6", "9"]);
    expect(visibleThread(thread.slice(0, 8), "all", 6).hidden).toBe(0);
  });
});

import { followUpOf } from "./IssuePanel";

describe("follow-up tasks", () => {
  const issue = { identifier: "YOG-3", title: "Fix the lobby", description: "Details", priority: "high", projectId: "p", assigneeAgentId: "a", goalId: null } as never;
  it("links back from a follow-up and copies everything for a copy", () => {
    expect(followUpOf(issue, "YOG", "follow-up")).toMatchObject({ title: "Follow-up: Fix the lobby", description: "Follow-up to [YOG-3](/YOG/issues/YOG-3).\n\n", priority: "high", assigneeAgentId: "a" });
    expect(followUpOf(issue, "YOG", "copy")).toMatchObject({ title: "Copy of Fix the lobby", description: "Details", projectId: "p" });
  });
});

import { meetingSpeaker } from "./IssuePanel";
describe("meeting lines in the thread", () => {
  it("shows the attendee who spoke, not the office that posted it", () => {
    const agents = [{ name: "Ada" }, { name: "QA" }];
    expect(meetingSpeaker("**🗣 Ada · round 2**\n\nUse CSS variables.", agents)).toEqual({ agent: agents[0], round: 2, body: "Use CSS variables." });
    expect(meetingSpeaker("**🗣 CEO**\n\nShip it.", agents)).toBeNull();
    expect(meetingSpeaker("**🗣 Nobody · round 1**\n\nx", agents)).toBeNull();
  });
});
