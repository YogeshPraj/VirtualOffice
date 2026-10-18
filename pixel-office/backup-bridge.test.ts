import { describe, expect, it } from "vitest";
import { onlyStampChanged } from "./backup-bridge";

describe("backup tidy", () => {
  it("spots commit-stamp-only diffs", () => {
    const stamp = `--- a/x\n+++ b/x\n@@ -9 +9 @@\n-      commit: "06c937015c227be2b88783e04246e6794db6c0ab"\n+      commit: "8b4404d42b43403c06b25b3ad39c749a8d077a5c"`;
    expect(onlyStampChanged(stamp)).toBe(true);
    expect(onlyStampChanged(`${stamp}\n+new instruction line`)).toBe(false);
    expect(onlyStampChanged("")).toBe(false);
  });
});
