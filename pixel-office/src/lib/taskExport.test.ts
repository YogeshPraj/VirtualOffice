import { describe, expect, it } from "vitest";
import { demote, taskMarkdown } from "./taskExport";

describe("task export", () => {
  it("builds a self-contained Markdown document", () => {
    const md = taskMarkdown(
      {
        issue: { identifier: "YOG-3", title: "Fix it", status: "in_review", priority: "high", assigneeAgentId: "a", createdAt: "2026-10-18T10:00:00Z", description: "**Source:** https://github.com/o/r/issues/5\n\nSee [YOG-7](/YOG/issues/YOG-7)." },
        comments: [{ authorAgentId: "a", body: "Done, ping [@QA](agent://q).", createdAt: "2026-10-18T11:00:00Z" }, { authorAgentId: null, body: "Thanks", createdAt: "2026-10-18T12:00:00Z" }],
        documents: [{ key: "plan", title: "Plan", body: "# Steps" }],
        products: [{ title: "PR 9", url: "https://github.com/o/r/pull/9", type: "pull_request", status: "merged", summary: null }],
        attachments: [{ originalFilename: "shot.png", byteSize: 4096 }],
      } as never,
      (id) => (id === "a" ? "Ada" : undefined),
      () => "when",
    );
    expect(md).toContain("# YOG-3: Fix it");
    expect(md).toContain("| Assignee | Ada |");
    expect(md).toContain("| Source | [o/r#5](https://github.com/o/r/issues/5) |");
    expect(md).toContain("See YOG-7.");
    expect(md).toContain("- [PR 9](https://github.com/o/r/pull/9) (pull request, merged)");
    expect(md).toContain("## Document: Plan");
    expect(md).toContain("- shot.png (4 KB)");
    expect(md).toContain("**Ada**, when:\n\nDone, ping @QA.");
    expect(md).toContain("**CEO**, when:");
    expect(md).toContain("### Steps");
    expect(demote("# A\n```\n# not a heading\n```\n###### deep")).toBe("### A\n```\n# not a heading\n```\n###### deep");
  });
});
