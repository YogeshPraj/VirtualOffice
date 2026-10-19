import { describe, expect, it } from "vitest";
import { needsSetup } from "./update-bridge";

describe("office updates", () => {
  it("asks for setup only when packages, setup or adapters change", () => {
    expect(needsSetup(["pixel-office/src/App.tsx", "docs/BACKLOG.md"])).toBe(false);
    expect(needsSetup(["pixel-office/package-lock.json"])).toBe(true);
    expect(needsSetup(["setup.ps1"])).toBe(true);
    expect(needsSetup(["adapters/copilot-local/src/server/execute.js"])).toBe(true);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateNow, updateStatus } from "./update-bridge";

describe("office updates against real git", () => {
  it("sees a new commit upstream and fast-forwards to it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "office-update-"));
    const g = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe" }).toString().trim();
    const origin = join(dir, "origin.git");
    const seed = join(dir, "seed");
    const clone = join(dir, "clone");
    try {
      g(dir, "init", "--bare", "-b", "main", origin);
      g(dir, "clone", "-q", origin, seed);
      for (const r of [seed]) {
        g(r, "config", "user.email", "t@example.com");
        g(r, "config", "user.name", "t");
      }
      writeFileSync(join(seed, "a.txt"), "1");
      g(seed, "add", "."), g(seed, "commit", "-qm", "first"), g(seed, "push", "-q", "origin", "HEAD:main");
      g(dir, "clone", "-q", origin, clone);
      writeFileSync(join(seed, "package-lock.json"), "{}");
      g(seed, "add", "."), g(seed, "commit", "-qm", "Add a lockfile"), g(seed, "push", "-q", "origin", "HEAD:main");

      const s = await updateStatus(true, clone);
      expect(s).toMatchObject({ behind: 1, ahead: 0, dirty: 0, needsSetup: true });
      expect(s.commits.map((c) => c.subject)).toEqual(["Add a lockfile"]);
      const u = await updateNow(clone);
      expect(u).toMatchObject({ ok: true, needsSetup: true, changed: 1 });
      expect((await updateStatus(true, clone)).behind).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
