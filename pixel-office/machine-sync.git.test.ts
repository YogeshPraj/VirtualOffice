import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { check, pull } from "./machine-sync";

// Two clones of one bare repo stand in for the PC and the laptop.
const root = mkdtempSync(join(tmpdir(), "machines-"));
const g = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const ident = ["-c", "user.name=Test", "-c", "user.email=test@example.invalid"];
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("two machines, one company repo", () => {
  it("sees the other machine's backup, then pulls it", async () => {
    const bare = join(root, "company.git");
    g(root, "init", "-q", "--bare", "-b", "main", bare);
    const pc = join(root, "pc");
    const laptop = join(root, "laptop");
    g(root, "clone", "-q", bare, pc);
    writeFileSync(join(pc, "README.md"), "company\n");
    g(pc, "add", "-A");
    g(pc, ...ident, "commit", "-q", "-m", "First");
    g(pc, "push", "-q", "-u", "origin", "HEAD:main");
    g(root, "clone", "-q", bare, laptop);

    writeFileSync(join(laptop, "README.md"), "company, updated\n");
    g(laptop, "add", "-A");
    g(laptop, ...ident, "commit", "-q", "-m", "Backup from the pixel office", "-m", "Office-Machine: LAPTOP");
    g(laptop, "push", "-q");

    const seen = await check(true, pc);
    expect(seen).toMatchObject({ repo: true, behind: 1, ahead: 0, dirty: 0, error: null });
    expect(seen.lastRemote?.machine).toBe("LAPTOP");

    writeFileSync(join(pc, "scratch.txt"), "local change");
    expect((await pull(pc)).ok).toBe(false); // never pulls over local changes
    rmSync(join(pc, "scratch.txt"));

    const r = await pull(pc);
    expect(r.ok).toBe(true);
    expect(r.state.behind).toBe(0);
  }, 60_000);
});
