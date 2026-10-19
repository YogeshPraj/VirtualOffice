import { describe, expect, it } from "vitest";
import { bubbleText } from "./liveSpeech";

describe("speech bubbles", () => {
  it("shows what someone says or does, not their thinking or raw output", () => {
    expect(bubbleText({ kind: "say", text: "Checking the **router** tests" })).toBe("Checking the router tests");
    expect(bubbleText({ kind: "tool", text: "powershell npm test" })).toBe("» powershell npm test");
    expect(bubbleText({ kind: "err", text: "not found" })).toBe("⚠ not found");
    expect(bubbleText({ kind: "think", text: "hmm" })).toBeNull();
    expect(bubbleText({ kind: "out", text: "{...}" })).toBeNull();
  });
});
