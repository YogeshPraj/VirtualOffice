import { describe, expect, it } from "vitest";
import { snoozeUntil, splitSnoozed } from "./snooze";

describe("snooze", () => {
  const mon = new Date(2026, 9, 19, 15, 0); // Monday 3pm
  const sun = new Date(2026, 9, 18, 20, 0); // Sunday 8pm
  it("works out when to bring an item back", () => {
    expect(snoozeUntil("later", mon).getHours()).toBe(18);
    const t = snoozeUntil("tomorrow", mon);
    expect([t.getDate(), t.getHours()]).toEqual([20, 9]);
    expect(snoozeUntil("monday", mon).getDate()).toBe(26); // not today
    expect(snoozeUntil("monday", sun).getDate()).toBe(19);
  });
  it("hides items until their time", () => {
    const items = [{ sourceKind: "a", subject: { id: "1" } }, { sourceKind: "a", subject: { id: "2" } }];
    const now = Date.parse("2026-10-19T12:00:00Z");
    const r = splitSnoozed(items, { "a:1": "2026-10-19T13:00:00Z", "a:2": "2026-10-19T11:00:00Z" }, now);
    expect(r.asleep.map((x) => x.subject.id)).toEqual(["1"]);
    expect(r.awake.map((x) => x.subject.id)).toEqual(["2"]);
  });
});
