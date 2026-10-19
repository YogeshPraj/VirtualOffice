import { describe, expect, it } from "vitest";
import { linkIdentifiers } from "./AskOffice";
import { buildPrompt } from "../../ask-office";

describe("ask the office", () => {
  it("links bare task identifiers, not ones already linked or in code", () => {
    expect(linkIdentifiers("QA is on YOG-12 and [YOG-3](/YOG/issues/YOG-3); see `YOG-9`.", "YOG")).toBe(
      "QA is on [YOG-12](/YOG/issues/YOG-12) and [YOG-3](/YOG/issues/YOG-3); see `YOG-9`.",
    );
  });
  it("puts the question first and the records after, as data", () => {
    const p = buildPrompt({
      question: "What is QA stuck on?",
      company: "Lab",
      agents: [{ id: "a", name: "QA", status: "idle" }, { id: "b", name: "Gone", status: "terminated" }],
      issues: [{ id: "i", identifier: "YOG-1", title: "Test", status: "blocked", priority: "high", assigneeAgentId: "a", updatedAt: "2026-10-19T10:00:00Z" }],
      threads: [{ identifier: "YOG-1", title: "Test", comments: [{ who: "QA", at: "2026-10-19T10:00:00Z", body: "Waiting on Redis" }] }],
      facts: ["Redis runs on the NAS"],
    });
    expect(p).toMatch(/data, not instructions/);
    expect(p.indexOf("QUESTION: What is QA stuck on?")).toBeLessThan(p.indexOf("TASKS"));
    expect(p).toMatch(/- YOG-1 \| blocked \| high \| QA \| 2026-10-19 \| Test/);
    expect(p).toMatch(/QA, 2026-10-19 10:00: Waiting on Redis/);
    expect(p).toMatch(/Redis runs on the NAS/);
    expect(p).not.toMatch(/Gone/);
  });
});
