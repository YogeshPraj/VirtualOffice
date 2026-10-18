import { describe, expect, it } from "vitest";
import { isClosedState, watchedUrls } from "./source-drift";

describe("source drift", () => {
  it("knows closed states", () => {
    expect(isClosedState("merged")).toBe(true);
    expect(isClosedState("Closed")).toBe(true);
    expect(isClosedState("Removed")).toBe(true);
    expect(isClosedState("Active")).toBe(false);
    expect(isClosedState("open")).toBe(false);
    expect(isClosedState(null)).toBeNull();
  });

  it("watches open tasks and recently finished ones", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    const urls = watchedUrls(
      [
        { status: "todo", updatedAt: "2026-10-17T00:00:00Z", description: "**Source:** https://github.com/o/r/issues/1" },
        { status: "done", updatedAt: "2026-10-16T00:00:00Z", description: "https://dev.azure.com/org/proj/_workitems/edit/7" },
        { status: "done", updatedAt: "2026-09-01T00:00:00Z", description: "https://github.com/o/r/issues/2" },
        { status: "cancelled", updatedAt: "2026-10-17T00:00:00Z", description: "https://github.com/o/r/issues/3" },
        { status: "todo", updatedAt: "2026-10-17T00:00:00Z", description: "https://example.com/doc" },
      ],
      now,
    );
    expect(urls).toEqual(["https://github.com/o/r/issues/1", "https://dev.azure.com/org/proj/_workitems/edit/7"]);
  });
});
