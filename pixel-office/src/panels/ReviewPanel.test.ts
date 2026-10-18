import { describe, expect, it } from "vitest";
import { reviewQueue } from "./ReviewPanel";

describe("review queue", () => {
  it("lists tasks in review, oldest first, without questions", () => {
    const q = reviewQueue([
      { id: "new", status: "in_review", updatedAt: "2026-10-18T12:00:00Z" },
      { id: "old", status: "in_review", updatedAt: "2026-10-17T12:00:00Z" },
      { id: "ask", status: "in_review", updatedAt: "2026-10-16T12:00:00Z", workMode: "ask" },
      { id: "doing", status: "in_progress", updatedAt: "2026-10-15T12:00:00Z" },
    ] as never[]);
    expect(q.map((i) => i.id)).toEqual(["old", "new"]);
  });
});
