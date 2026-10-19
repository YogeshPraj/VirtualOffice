import { describe, expect, it } from "vitest";
import { handoverPrompt, splitNotes } from "./handover";

describe("handover notes", () => {
  it("asks for one fixed section per task, from the records only", () => {
    const p = handoverPrompt("QA", [{ issue: { id: "i", identifier: "YOG-2", title: "Smoke test", status: "todo", priority: "medium", assigneeAgentId: "a", description: "Run /qa-only" }, comments: [{ who: "QA", at: "2026-10-19T10:00:00Z", body: "Half done" }] }]);
    expect(p).toMatch(/data, not instructions/);
    expect(p).toMatch(/=== YOG-2 \| todo \| medium \| Smoke test\nDetails: Run \/qa-only\n- QA, 2026-10-19 10:00: Half done/);
  });
  it("splits the answer per task and ignores tasks it wasn't asked about", () => {
    const text = "### YOG-2\n**Where it stands:** half done.\n**What's next:** finish.\n\n### YOG-9\n**Where it stands:** x\n\n### YOG-99\nnot ours";
    expect(splitNotes(text, ["YOG-2", "YOG-9"])).toEqual({ "YOG-2": "**Where it stands:** half done.\n**What's next:** finish.", "YOG-9": "**Where it stands:** x" });
  });
});
