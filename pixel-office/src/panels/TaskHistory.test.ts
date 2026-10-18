import { describe, expect, it } from "vitest";
import { describe as describeEntry, fold, plain } from "./TaskHistory";

const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 17, m)).toISOString();
const entry = (action: string, details: Record<string, unknown> = {}, m = 0) =>
  ({ id: String(m), action, actorType: "agent", actorId: "a1", entityType: "issue", entityId: "i", agentId: "a1", details, createdAt: at(m) }) as never;
const name = () => "Ada";

describe("task history", () => {
  it("describes status and assignment changes", () => {
    const l = describeEntry(entry("issue.updated", { changes: { status: { from: "in_progress", to: "done" }, assigneeAgentId: { to: "a1" } } }), name);
    expect(l.icon).toBe("✅");
    expect(l.text).toBe("Ada moved it in progress → done, assigned it to Ada");
  });

  it("folds interleaved bursts", () => {
    const lines = [0, 1, 2].flatMap((m) => [describeEntry(entry("issue.attachment_added", { originalFilename: `f${m}.png` }, m), name), describeEntry(entry("issue.work_product_created", {}, m), name)]);
    const out = fold(lines);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(3);
  });

  it("strips markdown from snippets", () => {
    expect(plain("**Routed to [@QA](agent://x).** ## Next")).toBe("Routed to @QA. Next");
  });
});
