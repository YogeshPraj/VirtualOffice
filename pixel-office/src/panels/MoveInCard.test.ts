import { describe, expect, it } from "vitest";
import { moveInSteps, type MoveInInput } from "./MoveInCard";

const ready: MoveInInput = {
  setup: [{ id: "git", level: "ok" }, { id: "copilot", level: "warn" }],
  repo: true,
  behind: 0,
  missingSettings: [],
  secrets: 3,
  agents: [{ name: "QA", status: "idle" }],
};
const open = (i: MoveInInput) => moveInSteps(i).filter((s) => !s.done).map((s) => s.id);

describe("move-in checklist", () => {
  it("is all done on a machine that's moved in (warnings don't block)", () => {
    expect(open(ready)).toEqual([]);
  });
  it("lists what's left on a fresh laptop", () => {
    const fresh: MoveInInput = { setup: [{ id: "claude", level: "bad" }], repo: false, behind: 0, missingSettings: [], secrets: 0, agents: [] };
    expect(open(fresh)).toEqual(["machine", "repo", "pull", "vault", "team"]);
  });
  it("asks to pull, restore settings and look at broken employees", () => {
    const s = moveInSteps({ ...ready, behind: 2, missingSettings: ["due.json", "pins.json"], agents: [{ name: "QA", status: "error" }, { name: "Old", status: "terminated" }] });
    expect(s.filter((x) => !x.done).map((x) => x.id)).toEqual(["pull", "settings", "team"]);
    expect(s.find((x) => x.id === "settings")?.detail).toMatch(/due, pins/);
    expect(s.find((x) => x.id === "team")?.detail).toMatch(/QA/);
  });
});
