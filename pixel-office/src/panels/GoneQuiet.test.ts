import { describe, expect, it } from "vitest";
import { goneQuiet } from "./GoneQuiet";

const now = Date.parse("2026-10-19T12:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe("gone quiet", () => {
  it("uses a different patience per status, longest-quiet first", () => {
    const q = goneQuiet([
      { id: "a", status: "in_progress", lastActivityAt: ago(30), updatedAt: ago(30) },
      { id: "b", status: "in_progress", lastActivityAt: ago(5), updatedAt: ago(5) },
      { id: "c", status: "todo", lastActivityAt: ago(48), updatedAt: ago(48) },
      { id: "d", status: "todo", lastActivityAt: ago(80), updatedAt: ago(80) },
      { id: "e", status: "done", lastActivityAt: ago(500), updatedAt: ago(500) },
      { id: "f", status: "blocked", lastActivityAt: null, updatedAt: ago(60) },
      { id: "g", status: "in_progress", lastActivityAt: ago(90), updatedAt: ago(90), workMode: "ask" },
    ] as never[], now);
    expect(q.map((x) => x.issue.id)).toEqual(["d", "f", "a"]);
  });
});
