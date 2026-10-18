import { describe, expect, it } from "vitest";
import { newlyDone } from "./useOfficeSounds";

describe("office sounds", () => {
  it("chimes only for tasks that just became done", () => {
    const prev = new Map([["a", "in_progress"], ["b", "done"]]);
    expect(newlyDone(prev, [{ id: "a", status: "done" }, { id: "b", status: "done" }, { id: "c", status: "done" }] as never[])).toEqual(["a"]);
    expect(newlyDone(null, [{ id: "a", status: "done" }] as never[])).toEqual([]);
  });
});
