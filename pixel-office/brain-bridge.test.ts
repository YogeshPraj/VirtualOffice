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
