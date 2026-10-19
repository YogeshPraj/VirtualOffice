import { describe, expect, it } from "vitest";
import { deskSlots } from "./layout";
import { mustFlee, nextPlan } from "./OfficeCat";

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("the office cat", () => {
  const desks = deskSlots(3);
  it("naps only on desks nobody is working at", () => {
    const p = nextPlan(desks, [true, false, true], seq(0.1, 0.0));
    expect(p).toMatchObject({ kind: "nap", desk: 1 });
  });
  it("strolls when every desk is busy, staying on the floor", () => {
    const p = nextPlan(desks, [true, true, true], seq(0.1, 0.5, 0.5));
    expect(p.kind).toBe("walk");
    expect(p.x).toBeGreaterThanOrEqual(40);
    expect(p.y).toBeLessThanOrEqual(405);
  });
  it("bolts when its desk gets busy", () => {
    expect(mustFlee({ kind: "nap", desk: 1, x: 0, y: 0 }, [false, true])).toBe(true);
    expect(mustFlee({ kind: "nap", desk: 1, x: 0, y: 0 }, [true, false])).toBe(false);
    expect(mustFlee({ kind: "walk", x: 0, y: 0 }, [true])).toBe(false);
  });
});
