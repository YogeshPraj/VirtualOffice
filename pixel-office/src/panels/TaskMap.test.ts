import { describe, expect, it } from "vitest";
import { layout, rootOf } from "./TaskMap";

const i = (id: string, parentId: string | null, n: number, status = "todo") => ({ id, parentId, createdAt: `2026-10-0${n}`, status }) as never as { id: string; parentId: string | null; createdAt: string; status: "todo" };

describe("task map", () => {
  const issues = [i("root", null, 1), i("a", "root", 2), i("b", "root", 3), i("a1", "a", 4), i("a2", "a", 5), i("gone", "root", 6, "cancelled")];
  it("finds the top of the tree", () => {
    expect(rootOf("a2", new Map(issues.map((x) => [x.id, x])))).toBe("root");
  });
  it("lays children out in columns, parents centred on their children", () => {
    const pos = Object.fromEntries(layout("root", issues).map((n) => [n.id, [n.depth, n.row]]));
    expect(pos).toEqual({ root: [0, 1], a: [1, 0.5], a1: [2, 0], a2: [2, 1], b: [1, 2] });
  });
});
