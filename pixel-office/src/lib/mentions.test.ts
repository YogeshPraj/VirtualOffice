import { describe, expect, it } from "vitest";
import { linkMentions, mentionAtCaret } from "./mentions";

const people = [
  { id: "a1", name: "Fullstack1" },
  { id: "a12", name: "Fullstack12" },
  { id: "qa", name: "QA" },
];

describe("mentions", () => {
  it("links names and collects ids", () => {
    const r = linkMentions("@QA please check, and @fullstack12 too. email me@QA.com", people);
    expect(r.body).toBe("[@QA](agent://qa) please check, and [@Fullstack12](agent://a12) too. email me@QA.com");
    expect(r.ids.sort()).toEqual(["a12", "qa"]);
  });

  it("keeps existing links and ignores unknown names", () => {
    const r = linkMentions("[@QA](agent://qa) and @Bob", people);
    expect(r.body).toBe("[@QA](agent://qa) and @Bob");
    expect(r.ids).toEqual(["qa"]);
  });

  it("finds the mention being typed", () => {
    expect(mentionAtCaret("hi @Ful", 7)).toEqual({ start: 3, query: "Ful" });
    expect(mentionAtCaret("hi @", 4)).toEqual({ start: 3, query: "" });
    expect(mentionAtCaret("mail a@b", 8)).toBeNull();
  });
});
