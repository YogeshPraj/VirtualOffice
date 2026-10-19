import { describe, expect, it } from "vitest";
import { shortcutScript, startupFolder } from "./autostart-bridge";

describe("start with Windows", () => {
  it("uses the per-user Startup folder and passes paths as data", () => {
    expect(startupFolder({ APPDATA: "C:\Users\a\AppData\Roaming" })).toBe("C:\Users\a\AppData\Roaming/Microsoft/Windows/Start Menu/Programs/Startup".replace(/\//g, require("node:path").sep));
    expect(startupFolder({})).toBeNull();
    expect(shortcutScript()).toContain("$env:VO_LINK");
    expect(shortcutScript()).not.toMatch(/[A-Z]:\\/);
  });
});
