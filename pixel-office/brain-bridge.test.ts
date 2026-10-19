import { describe, expect, it } from "vitest";
import { slugify, toPage } from "./brain-bridge";

describe("brain import", () => {
  it("slugs paths safely", () => {
    expect(slugify("Team Notes/ADO Boards & Sprints.md")).toBe("team-notes/ado-boards-sprints");
    expect(slugify("../../etc/passwd.txt")).toBe("etc/passwd");
  });
  it("adds frontmatter only when missing", () => {
    const page = toPage("a/plan.md", "# Release plan\r\nShip it", "vault", new Date("2026-10-18T00:00:00Z"));
    expect(page).toContain(`title: "Release plan"`);
    expect(page).toContain("tags: [imported]");
    expect(page.endsWith("Ship it")).toBe(true);
    const own = "---\ntitle: Mine\n---\nbody";
    expect(toPage("x.md", own, "vault")).toBe(own);
  });
});

import { rankFacts } from "./brain-bridge";

describe("brain ask", () => {
  it("ranks facts by the words they contain", () => {
    const facts = [
      { fact: "EvalComparison treats a case as regressed", entity_slug: "trellis" },
      { fact: "Redis real-server integration coverage lives in Trellis.State.Redis.Tests", entity_slug: "trellis" },
      { fact: "Prefers Redis for caches", entity_slug: "ceo" },
    ];
    expect(rankFacts(facts, "redis tests").map((f) => f.fact[0])).toEqual(["R", "P"]);
    expect(rankFacts(facts, "kafka")).toEqual([]);
    expect(rankFacts(facts, "")).toEqual([]);
  });
});
