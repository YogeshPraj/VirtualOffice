// Two-machine safety: the PC and the laptop share the company through the private company repo.
// This knows which machine it is, checks the repo every few minutes, and says when another machine
// has backed up more recently, so nobody works from (and later overwrites) a stale copy.
//
//   GET  /office-admin/machine         -> this machine, and whether company/ is behind (?force=1 refetches)
//   POST /office-admin/machine/pull    -> fast-forward company/ (refuses with local changes)

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import type { MachineState } from "./src/lib/machine";

const COMPANY = resolve(__dirname, "..", "company");
const FETCH_EVERY_MS = 10 * 60_000;
export const TRAILER = "Office-Machine";

/** The name backups are signed with: VIRTUAL_OFFICE_MACHINE if set, else the computer name. */
export const machineName = (env = process.env) => (env.VIRTUAL_OFFICE_MACHINE?.trim() || hostname()).slice(0, 60);

function git(dir: string, ...args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((done) => {
    execFile("git", ["-C", dir, ...args], { timeout: 60_000, windowsHide: true }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout ?? ""}${stderr ?? ""}`.trim() }));
  });
}

/** "Office-Machine: LAPTOP" trailer in a commit message → "LAPTOP". */
export function machineOf(message: string): string | null {
  return message.match(new RegExp(`^${TRAILER}:\\s*(.+)$`, "m"))?.[1].trim() ?? null;
}


let state: MachineState = { machine: machineName(), repo: false, behind: 0, ahead: 0, dirty: 0, lastRemote: null, checkedAt: null, error: null };
let lastFetch = 0;

export async function check(force = false, dir = COMPANY): Promise<MachineState> {
  const repo = existsSync(join(dir, ".git"));
  if (!repo) return (state = { ...state, repo: false, behind: 0, ahead: 0, error: null });
  let error: string | null = null;
  if (force || Date.now() - lastFetch > FETCH_EVERY_MS) {
    const f = await git(dir, "fetch", "-q");
    lastFetch = Date.now();
    if (!f.ok) error = `Couldn't reach the company repo's remote (offline?). ${f.out.split("\n").slice(-1)[0] ?? ""}`.trim();
  }
  const [counts, status, log] = await Promise.all([git(dir, "rev-list", "--left-right", "--count", "HEAD...@{u}"), git(dir, "status", "--porcelain"), git(dir, "log", "-1", "--format=%cI%x00%s%x00%B", "@{u}")]);
  const [ahead, behind] = counts.ok ? counts.out.split(/\s+/).map(Number) : [0, 0];
  let lastRemote: MachineState["lastRemote"] = null;
  if (log.ok && log.out) {
    const [at, subject, body] = log.out.split("\0");
    lastRemote = { machine: machineOf(body ?? ""), at, subject };
  }
  if (!counts.ok && !error) error = "The company repo has no upstream branch to compare with.";
  state = { machine: machineName(), repo, ahead: ahead || 0, behind: behind || 0, dirty: status.ok ? status.out.split("\n").filter(Boolean).length : 0, lastRemote, checkedAt: new Date().toISOString(), error };
  return state;
}

export async function pull(dir = COMPANY): Promise<{ ok: boolean; detail: string; state: MachineState }> {
  const before = await check(true, dir);
  if (!before.repo) return { ok: false, detail: "No company repo in company/.", state: before };
  if (before.dirty) return { ok: false, detail: `company/ has ${before.dirty} uncommitted change(s). Back up (or tidy) first, then pull.`, state: before };
  if (!before.behind) return { ok: true, detail: "Already up to date.", state: before };
  const r = await git(dir, "pull", "--ff-only", "-q");
  const after = await check(false, dir);
  return r.ok
    ? { ok: true, detail: `Pulled ${before.behind} commit(s). Restore office settings from Building status if you want the other machine's templates, due dates and pins.`, state: after }
    : { ok: false, detail: `Couldn't fast-forward (both machines changed it?): ${r.out.slice(0, 300)}`, state: after };
}

export function machineSync(): Plugin {
  return {
    name: "pixel-office-machine-sync",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer) {
        const t = setInterval(() => void check(), FETCH_EVERY_MS);
        t.unref();
        server.httpServer.once("close", () => clearInterval(t));
        setTimeout(() => void check(true), 20_000).unref();
      }
      server.middlewares.use("/office-admin/machine", async (req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.method === "POST" && (req.url ?? "").startsWith("/pull")) return res.end(JSON.stringify(await pull()));
        if (req.method === "GET") return res.end(JSON.stringify(await check((req.url ?? "").includes("force=1"))));
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "GET or POST /pull" }));
      });
    },
  };
}
