import { describe, expect, it } from "vitest";
import { describeChange, inverseOf, isEmpty } from "./undo";

describe("undo", () => {
  it("restores only what changed", () => {
    const before = { status: "todo", assigneeAgentId: null, priority: "low" } as never;
    expect(inverseOf(before, { status: "done", priority: "low" })).toEqual({ status: "todo" });
    expect(inverseOf(before, { assigneeAgentId: "a" })).toEqual({ assigneeAgentId: null });
    expect(isEmpty(inverseOf(before, { status: "todo" }))).toBe(true);
  });
  it("describes the change", () => {
    expect(describeChange({ status: "in_review" }, () => "")).toBe("moved to in review");
    expect(describeChange({ assigneeAgentId: "a" }, () => "QA")).toBe("assigned to QA");
  });
});
