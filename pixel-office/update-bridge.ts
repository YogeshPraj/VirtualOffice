// Office updates: check GitHub for a newer version of this repo and fast-forward to it.
// Read-only check by default; the update is an explicit POST (the CEO clicks Update).
//
//   GET  /office-admin/update   -> { branch, behind, ahead, dirty, commits, needsSetup, error? }
//   POST /office-admin/update   -> { ok, from, to, needsSetup, changed }

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ROOT = resolve(__dirname, "..");
const FETCH_EVERY_MS = 30 * 60_000;

function run(args: string[], timeoutMs = 60_000, root = ROOT): Promise<{ ok: boolean; out: string }> {
  return new Promise((done) => {
    execFile("git", ["-C", root, ...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) =>
      done({ ok: !err, out: `${stdout ?? ""}${err ? (stderr ?? err.message) : ""}`.trimEnd() }),
    );
  });
}

/** Files whose change means setup.ps1 (npm ci, adapters, tools) should run again. */
export function needsSetup(changedFiles: string[]): boolean {
  return changedFiles.some((f) => /(^|\/)package(-lock)?\.json$/.test(f) || /^setup\.ps1$/.test(f) || /^adapters\//.test(f) || /^scripts\/ensure-adapters\.ps1$/.test(f));
}

let lastFetch = 0;

export async function updateStatus(force = false, root = ROOT) {
  const git = (args: string[], t?: number) => run(args, t, root);
  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) return { branch, behind: 0, ahead: 0, dirty: 0, commits: [], needsSetup: false, error: "This copy isn't tracking a GitHub branch, so it can't check for updates." };
  let fetchError: string | null = null;
  if (force || Date.now() - lastFetch > FETCH_EVERY_MS) {
    const f = await git(["fetch", "--quiet", "origin"], 60_000);
    if (f.ok) lastFetch = Date.now();
    else fetchError = "Couldn't reach GitHub to check for updates.";
  }
  const counts = (await git(["rev-list", "--left-right", "--count", "HEAD...@{u}"])).out.split(/\s+/).map(Number);
  const [ahead, behind] = [counts[0] || 0, counts[1] || 0];
  const dirty = (await git(["status", "--porcelain", "--untracked-files=no"])).out.split("\n").filter(Boolean).length;
  const log = behind ? (await git(["log", "--format=%h%x09%s", "HEAD..@{u}", "-n", "30"])).out.split("\n").filter(Boolean) : [];
  const changed = behind ? (await git(["diff", "--name-only", "HEAD...@{u}"])).out.split("\n").filter(Boolean) : [];
  return {
    branch,
    behind,
    ahead,
    dirty,
    commits: log.map((l) => ({ hash: l.split("\t")[0], subject: l.split("\t").slice(1).join("\t") })),
    needsSetup: needsSetup(changed),
    error: fetchError,
  };
}

export async function updateNow(root = ROOT) {
  const git = (args: string[], t?: number) => run(args, t, root);
  const before = (await git(["rev-parse", "--short", "HEAD"])).out;
  const dirty = (await git(["status", "--porcelain", "--untracked-files=no"])).out.split("\n").filter(Boolean);
  if (dirty.length) return { ok: false, error: `This copy has ${dirty.length} local change(s); commit or discard them first (git status).` };
  const changed = (await git(["diff", "--name-only", "HEAD...@{u}"])).out.split("\n").filter(Boolean);
  const pull = await git(["pull", "--ff-only", "--quiet"], 120_000);
  if (!pull.ok) return { ok: false, error: /not possible to fast-forward|diverged/i.test(pull.out) ? "This copy has its own commits, so it can't update automatically. Run git pull in a terminal." : pull.out.slice(0, 400) };
  const after = (await git(["rev-parse", "--short", "HEAD"])).out;
  return { ok: true, from: before, to: after, needsSetup: needsSetup(changed), changed: changed.length };
}

/** The running version, and the feature commits since `since` (a hash this copy has seen before). */
export async function changesSince(since: string, root = ROOT) {
  const git = (args: string[]) => run(args, 30_000, root);
  const head = (await git(["rev-parse", "HEAD"])).out.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(since) || since === head) return { head, commits: [] };
  const known = await git(["merge-base", "--is-ancestor", since, "HEAD"]);
  if (!known.ok) return { head, commits: [] }; // unknown or unrelated: nothing sensible to list
  const log = (await git(["log", "--format=%h%x09%s", `${since}..HEAD`, "-n", "60"])).out.split("\n").filter(Boolean);
  const commits = log
    .map((l) => ({ hash: l.split("\t")[0], subject: l.split("\t").slice(1).join("\t") }))
    .filter((c) => !/^(Backlog:|Merge |README:)/i.test(c.subject));
  return { head, commits };
}

export function updateBridge(): Plugin {
  return {
    name: "pixel-office-update",
    configureServer(server) {
      server.middlewares.use("/office-admin/update", async (req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          const url = new URL(req.url ?? "/", "http://local");
          if (req.method === "GET" && url.pathname === "/changes") return res.end(JSON.stringify(await changesSince(url.searchParams.get("since") ?? "")));
          if (req.method === "GET") return res.end(JSON.stringify(await updateStatus((req.url ?? "").includes("force=1"))));
          if (req.method === "POST") return res.end(JSON.stringify(await updateNow()));
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "GET or POST" }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
