import { describe, expect, it } from "vitest";
import { panelKey, pushRecent } from "./recent";

describe("recently viewed", () => {
  it("keys panels like the palette's commands", () => {
    expect(panelKey({ kind: "issue", issueId: "x" })).toBe("issue:x");
    expect(panelKey({ kind: "room", room: "hr" })).toBe("room:hr");
    expect(panelKey({ kind: "agent", agentId: "a" })).toBe("agent:a");
    expect(panelKey(null)).toBeNull();
  });
  it("keeps newest first without repeats", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
