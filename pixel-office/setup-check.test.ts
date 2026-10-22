import { describe, expect, it } from "vitest";
import { claudeSignedIn, diskCheck, hasBrain } from "./setup-check";

describe("setup check", () => {
  it("finds the brain in an MCP config without reading values", () => {
    expect(hasBrain('// comment\n{"mcpServers":{"gbrain":{"url":"x"}}}')).toBe(true);
    expect(hasBrain('{"mcpServers":{"other":{}}}')).toBe(false);
    expect(hasBrain("not json")).toBe(false);
    expect(hasBrain(null)).toBe(false);
  });
  it("reads Claude's sign-in flag", () => {
    expect(claudeSignedIn('{"loggedIn":true,"email":"x"}')).toBe(true);
    expect(claudeSignedIn('{"loggedIn":false}')).toBe(false);
    expect(claudeSignedIn("Not logged in")).toBe(false);
    expect(claudeSignedIn(null)).toBeNull();
  });
  it("grades free disk space", () => {
    expect(diskCheck(50).level).toBe("ok");
    expect(diskCheck(5).level).toBe("warn");
    expect(diskCheck(1).level).toBe("bad");
    expect(diskCheck(null).level).toBe("warn");
  });
});

import { engineArgs, officeEngine } from "./ask-office";
describe("the office's own AI", () => {
  it("uses Claude Code if it's there, else Copilot CLI, unless told otherwise", () => {
    const both = () => true;
    const copilotOnly = (c: string) => c === "copilot";
    expect(officeEngine({}, both)).toBe("claude");
    expect(officeEngine({}, copilotOnly)).toBe("copilot");
    expect(officeEngine({ VIRTUAL_OFFICE_AI: "Copilot" }, both)).toBe("copilot");
    expect(officeEngine({}, () => false)).toBeNull();
  });
  it("runs read-only: no tools, no MCP servers", () => {
    expect(engineArgs("copilot")).toEqual(expect.arrayContaining(["--available-tools", "none", "--disable-builtin-mcps", "--no-custom-instructions"]));
    expect(engineArgs("claude", false)).toEqual(expect.arrayContaining(["--tools", "", "--strict-mcp-config"]));
  });
});
