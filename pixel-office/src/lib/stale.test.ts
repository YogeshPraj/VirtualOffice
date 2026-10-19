import { describe, expect, it } from "vitest";
import { staleDays } from "./stale";

const now = Date.parse("2026-10-19T12:00:00Z");
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("stale notes", () => {
  it("flags open tasks nobody touched for a week", () => {
    expect(staleDays({ status: "todo", updatedAt: ago(8) }, now)).toBe(8);
    expect(staleDays({ status: "in_progress", updatedAt: ago(6) }, now)).toBeNull();
    expect(staleDays({ status: "blocked", updatedAt: ago(30), lastActivityAt: ago(2) }, now)).toBeNull();
  });
  it("leaves finished and parked work alone", () => {
    expect(staleDays({ status: "done", updatedAt: ago(30) }, now)).toBeNull();
    expect(staleDays({ status: "backlog", updatedAt: ago(30) }, now)).toBeNull();
  });
});
