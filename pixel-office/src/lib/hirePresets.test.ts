import { describe, expect, it } from "vitest";
import { freeName, withPlaybook } from "./hirePresets";

describe("hiring presets", () => {
  it("picks a name nobody has", () => {
    expect(freeName(["Ada", "grace"])).toBe("Linus");
  });
  it("adds the playbook once and replaces it on re-hire", () => {
    const once = withPlaybook("# Agent\n", { title: "QA Engineer", playbook: "- test it" });
    expect(once).toContain("## How you work as QA Engineer");
    const twice = withPlaybook(once, { title: "Code Reviewer", playbook: "- review it" });
    expect(twice.match(/role-playbook:begin/g)).toHaveLength(1);
    expect(twice).toContain("Code Reviewer");
    expect(twice).not.toContain("QA Engineer");
  });
});
