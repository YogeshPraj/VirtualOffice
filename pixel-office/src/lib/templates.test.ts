import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, fill, resolveAssignee } from "./templates";

const agents = [
  { id: "m", name: "Manager", role: "general", reportsTo: null, status: "idle" },
  { id: "q", name: "QA", role: "qa", reportsTo: "m", status: "idle" },
] as never[];

describe("templates", () => {
  it("fills {what} and resolves assignees", () => {
    expect(fill("Fix: {what}", " login loop ")).toBe("Fix: login loop");
    expect(fill("Fix: {what}", "")).toBe("Fix: …");
    expect(resolveAssignee(DEFAULT_TEMPLATES[0], agents)).toBe("m");
    expect(resolveAssignee(DEFAULT_TEMPLATES[1], agents)).toBe("q");
    expect(resolveAssignee({ ...DEFAULT_TEMPLATES[0], assignee: "designer" }, agents)).toBeNull();
  });
});
