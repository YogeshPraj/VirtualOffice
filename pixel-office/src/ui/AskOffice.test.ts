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

import { taskFromTurn } from "./AskOffice";
describe("ask, then act", () => {
  it("makes a task from a question and its answer", () => {
    expect(taskFromTurn({ q: "Who should fix the flaky Redis test?", a: "QA found it in YOG-17." })).toEqual({
      title: "Who should fix the flaky Redis test",
      description: 'QA found it in YOG-17.\n\n_From Ask the office: "Who should fix the flaky Redis test?"_',
    });
  });
  it("carries earlier turns into the prompt", () => {
    const p = buildPrompt({ question: "And who is free?", company: "Lab", agents: [], issues: [], threads: [], facts: [], history: [{ q: "What is blocked?", a: "YOG-3 waits on YOG-2." }] });
    expect(p).toMatch(/EARLIER IN THIS CONVERSATION[\s\S]*CEO: What is blocked\?\nYou: YOG-3 waits on YOG-2\.[\s\S]*QUESTION: And who is free\?/);
  });
});
