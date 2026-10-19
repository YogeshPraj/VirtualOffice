import { describe, expect, it } from "vitest";
import { checklist } from "./checklist";

describe("checklist", () => {
  it("counts ticked and open items, ignoring code blocks and empty boxes", () => {
    const md = ["## Done when", "- [x] Root cause found", "- [ ] Fix with a test", "* [X] QA verifies", "1. [ ] Docs", "- [ ]", "```", "- [ ] not real", "```"].join("\n");
    expect(checklist(md)).toEqual({ done: 2, total: 4 });
    expect(checklist(null)).toEqual({ done: 0, total: 0 });
  });
});
