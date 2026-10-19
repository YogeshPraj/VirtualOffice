import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectExport, importBody } from "./company-import";
import { importSummary } from "./src/ui/ImportCompany";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("bring your company", () => {
  it("collects the export with forward-slash paths and images as base64", () => {
    dir = mkdtempSync(join(tmpdir(), "export-"));
    mkdirSync(join(dir, "agents", "qa"), { recursive: true });
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "COMPANY.md"), "# Co");
    writeFileSync(join(dir, "agents", "qa", "AGENTS.md"), "qa");
    writeFileSync(join(dir, "logo.png"), Buffer.from([1, 2, 3]));
    writeFileSync(join(dir, ".git", "HEAD"), "ref");
    const files = collectExport(dir);
    expect(Object.keys(files).sort()).toEqual(["COMPANY.md", "agents/qa/AGENTS.md", "logo.png"]);
    expect(files["logo.png"]).toEqual({ encoding: "base64", data: "AQID", contentType: "image/png" });
  });
  it("imports people, projects and skills into a new company, never tasks", () => {
    const b = importBody({ "COMPANY.md": "x" }, "  ");
    expect(b.include).toMatchObject({ agents: true, projects: true, skills: true, issues: false });
    expect(b.target).toEqual({ mode: "new_company", newCompanyName: null });
    expect(importBody({}, "Lab").target.newCompanyName).toBe("Lab");
  });
  it("summarises the preview", () => {
    const s = importSummary({
      plan: { agentPlans: [{ slug: "qa", action: "create", plannedName: "QA" }, { slug: "x", action: "skip", plannedName: "X" }], projectPlans: [{ slug: "p", action: "create", plannedName: "Trellis" }] },
      manifest: { company: { name: "Lab" }, skills: [1, 2] },
      envInputs: [{ key: "TOKEN", requirement: "required" }, { key: "OPT", requirement: "optional" }],
      errors: [],
    });
    expect(s).toMatchObject({ company: "Lab", agents: ["QA"], projects: ["Trellis"], skills: 2, required: ["TOKEN"], errors: [] });
  });
});
