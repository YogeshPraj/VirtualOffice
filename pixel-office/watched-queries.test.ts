import { describe, expect, it } from "vitest";
import { cleanDef, nextPending } from "./watched-queries";

const hit = (n: number) => ({ url: `https://github.com/o/r/issues/${n}`, key: `o/r#${n}`, title: `Issue ${n}` });

describe("watched queries", () => {
  it("keeps only matches that are new, still matching, not tasks and not dismissed", () => {
    const known = "Source: https://github.com/o/r/issues/2";
    const out = nextPending([hit(4)], [hit(1), hit(2), hit(3)], [hit(3).url], known);
    expect(out.map((h) => h.key)).toEqual(["o/r#1"]); // 2 is a task, 3 dismissed, 4 no longer matches
  });

  it("cleans definitions", () => {
    const d = cleanDef({ id: "a b/../c", name: "", everyMin: 1, query: " q " }, 0);
    expect(d).toMatchObject({ id: "abc", name: "Watched query", everyMin: 5, query: "q", mine: false });
  });
});
