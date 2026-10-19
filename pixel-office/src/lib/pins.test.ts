import { describe, expect, it } from "vitest";
import { togglePin } from "./pins";

describe("pinned comments", () => {
  it("pins one comment per task, and unpins it again", () => {
    const a = togglePin({}, "t1", "c1");
    expect(a).toEqual({ t1: "c1" });
    expect(togglePin(a, "t1", "c2")).toEqual({ t1: "c2" });
    expect(togglePin(a, "t1", "c1")).toEqual({});
    expect(togglePin(a, "t2", "c9")).toEqual({ t1: "c1", t2: "c9" });
  });
});
