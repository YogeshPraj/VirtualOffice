import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("theme", () => {
  it("follows Windows on auto, otherwise the choice", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
