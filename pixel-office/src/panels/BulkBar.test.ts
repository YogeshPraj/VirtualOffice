import { describe, expect, it } from "vitest";
import { applyAll } from "./BulkBar";

describe("bulk apply", () => {
  it("applies to every task and collects refusals", async () => {
    const seen: string[] = [];
    const progress: number[] = [];
    const failed = await applyAll(["a", "b", "c"], { priority: "high" }, async (id) => { seen.push(id); if (id === "b") throw new Error("locked"); }, (n) => progress.push(n));
    expect(seen).toEqual(["a", "b", "c"]);
    expect(failed).toEqual([{ id: "b", error: "locked" }]);
    expect(progress).toEqual([1, 2, 3]);
  });
});
