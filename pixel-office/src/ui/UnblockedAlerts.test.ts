import { describe, expect, it } from "vitest";
import { freed, newlyDone } from "./UnblockedAlerts";

describe("unblocked", () => {
  it("only counts tasks that turned done while the office was open", () => {
    expect(newlyDone(null, [{ id: "a", status: "done" }])).toEqual([]);
    const prev = new Map([["a", "in_review"], ["b", "done"]]);
    expect(newlyDone(prev, [{ id: "a", status: "done" }, { id: "b", status: "done" }, { id: "c", status: "done" }])).toEqual(["a"]);
  });
  it("frees only tasks with no open blocker left", () => {
    const ref = (id: string, status = "blocked") => ({ id, identifier: id, title: id, status });
    expect(freed([ref("x"), ref("y"), ref("z", "done")], { x: 0, y: 1 }).map((r) => r.id)).toEqual(["x"]);
  });
});
