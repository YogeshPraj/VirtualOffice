import { describe, expect, it } from "vitest";
import { parseReplies } from "./QuickReplies";

describe("quick replies", () => {
  it("parses one reply per line", () => {
    expect(parseReplies(" Go ahead. \n\nShip it\r\n")).toEqual(["Go ahead.", "Ship it"]);
    expect(parseReplies(Array.from({ length: 20 }, (_, i) => `r${i}`).join("\n"))).toHaveLength(12);
  });
});
