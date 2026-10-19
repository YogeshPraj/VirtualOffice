// "Back up now": refresh the private company repo (company/) from the running Paperclip, and
// optionally commit and push it. Runs on the office server; every command here is fixed.
//
//   GET  /office-admin/backup -> { repo, lastExportAt, lastCommitAt, lastCommit, pending, remote }
//   POST /office-admin/backup { companyId, commit, push } -> { steps: [{ step, ok, detail }] }

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { machineName, TRAILER } from "./machine-sync";
import { SECRET_PATTERNS } from "./brain-bridge";

const ROOT = resolve(__dirname, "..");
const COMPANY = join(ROOT, "company");
const EXPORT = join(COMPANY, "paperclip-export");
const OFFICE = join(ROOT, ".office");
const OFFICE_BACKUP = join(COMPANY, "office-settings");

/**
 * Office settings worth keeping with the company: name -> how to slim it for the backup.
 * (sources.json is a cache and instructions-history.json duplicates the export, so neither goes.)
 */
const SETTINGS: Record<string, (data: unknown) => unknown> = {
  "templates.json": (d) => d,
  "views.json": (d) => d,
  "focus.json": (d) => d,
  "due.json": (d) => d,
  "replies.json": (d) => d,
  "pins.json": (d) => d,
  "leave.json": (d) => d,
  "working-hours.json": (d) => ({ settings: (d as { settings?: unknown })?.settings ?? d }),
  // Only the definitions: pending matches and dismissals are per-machine state.
  "watches.json": (d) =>
    Array.isArray(d) ? d.map((w: Record<string, unknown>) => ({ id: w.id, name: w.name, query: w.query, project: w.project, mine: w.mine, everyMin: w.everyMin })) : d,
};

/** Copy office settings into company/office-settings/. Returns the files written. */
export function saveOfficeSettings(): string[] {
  const written: string[] = [];
  for (const [name, slim] of Object.entries(SETTINGS)) {
    const src = join(OFFICE, name);
    if (!existsSync(src)) continue;
    try {
      const data = slim(JSON.parse(readFileSync(src, "utf8")));
      if (!existsSync(OFFICE_BACKUP)) mkdirSync(OFFICE_BACKUP, { recursive: true });
      writeFileSync(join(OFFICE_BACKUP, name), `${JSON.stringify(data, null, 2)}\n`);
      written.push(name);
    } catch {
      /* unreadable setting: leave the previous backup alone */
    }
  }
  return written;
}

/** Bring settings back from the company repo (e.g. on a new machine). Existing ones are kept unless `overwrite`. */
export function restoreOfficeSettings(overwrite = false): string[] {
  const restored: string[] = [];
  if (!existsSync(OFFICE_BACKUP)) return restored;
  for (const name of Object.keys(SETTINGS)) {
    const src = join(OFFICE_BACKUP, name);
    const dst = join(OFFICE, name);
    if (!existsSync(src) || (existsSync(dst) && !overwrite)) continue;
    try {
      let data = JSON.parse(readFileSync(src, "utf8"));
      if (name === "watches.json" && Array.isArray(data)) data = data.map((w) => ({ ...w, lastRunAt: null, lastError: null, pending: [], dismissed: [] }));
      if (name === "working-hours.json") data = { settings: (data as { settings?: unknown }).settings ?? data, pausedByOffice: [] };
      if (!existsSync(OFFICE)) mkdirSync(OFFICE, { recursive: true });
      writeFileSync(dst, JSON.stringify(data, null, 2));
      restored.push(name);
    } catch {
      /* skip a damaged file */
    }
  }
  return restored;
}

const settingsStatus = () => ({
  backedUp: existsSync(OFFICE_BACKUP) ? Object.keys(SETTINGS).filter((n) => existsSync(join(OFFICE_BACKUP, n))) : [],
  missingHere: existsSync(OFFICE_BACKUP) ? Object.keys(SETTINGS).filter((n) => existsSync(join(OFFICE_BACKUP, n)) && !existsSync(join(OFFICE, n))) : [],
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function run(cmd: string, args: string[], cwd = ROOT, timeoutMs = 180_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((done) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      done({ ok: !err, out: `${stdout ?? ""}${stderr ?? ""}`.trimEnd() }),
    );
  });
}

const git = (...args: string[]) => run("git", ["-C", COMPANY, ...args], ROOT, 120_000);

function newestMtime(dir: string): number {
  let newest = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  if (existsSync(dir)) walk(dir, 0);
  return newest;
}

export async function backupStatus() {
  const repo = existsSync(join(COMPANY, ".git"));
  if (!repo) return { repo: false as const };
  const [log, status, remote] = await Promise.all([git("log", "-1", "--format=%cI%n%s"), git("status", "--porcelain"), git("remote", "get-url", "origin")]);
  const [lastCommitAt, lastCommit] = log.ok ? log.out.split("\n") : [null, null];
  const exported = newestMtime(EXPORT);
  return {
    repo: true as const,
    settings: settingsStatus(),
    lastExportAt: exported ? new Date(exported).toISOString() : null,
    lastCommitAt: lastCommitAt || null,
    lastCommit: lastCommit || null,
    pending: status.ok ? status.out.split("\n").filter(Boolean).length : 0,
    remote: remote.ok ? remote.out.replace(/\/\/[^@/]+@/, "//") : null, // never echo credentials in a URL
  };
}

/** Files about to be committed that look like they hold a secret. */
async function secretHits(): Promise<string[]> {
  const st = await git("status", "--porcelain");
  const files = st.out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ""))
    .filter((f) => !f.endsWith("/"));
  const hits: string[] = [];
  for (const f of files) {
    const p = join(COMPANY, f);
    try {
      if (!existsSync(p) || statSync(p).size > 2 * 1024 * 1024) continue;
      const text = readFileSync(p, "utf8");
      if (SECRET_PATTERNS.some((re) => re.test(text))) hits.push(f);
    } catch {
      /* binary or unreadable: skip */
    }
  }
  return hits;
}

/**
 * Paperclip stamps its bundled skills with the git HEAD of whatever folder it first exported
 * from, so every export "changes" them. Put back files whose only change is that stamp.
 */
export function onlyStampChanged(diff: string): boolean {
  const changes = diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
  return changes.length > 0 && changes.every((l) => /^[+-]\s*commit:\s*("[0-9a-f]{7,40}"|null)?\s*$/.test(l));
}

async function dropStampOnlyChanges(): Promise<number> {
  const st = await git("status", "--porcelain", "--", "paperclip-export/skills");
  const files = st.out
    .split("\n")
    .filter((l) => l.startsWith(" M"))
    .map((l) => l.slice(3).trim());
  let n = 0;
  for (const f of files) {
    const d = await git("diff", "-U0", "--", f);
    if (d.ok && onlyStampChanged(d.out)) {
      await git("checkout", "--", f);
      n++;
    }
  }
  return n;
}

export async function backupNow(opts: { companyId?: string; commit?: boolean; push?: boolean }) {
  const steps: { step: string; ok: boolean; detail: string }[] = [];
  if (!existsSync(join(COMPANY, ".git"))) {
    steps.push({ step: "Company repo", ok: false, detail: "No private company repo at company/. Clone yours there (see the README)." });
    return { steps };
  }
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "scripts", "export-company.ps1")];
  if (opts.companyId) {
    if (!UUID.test(opts.companyId)) throw new Error("Bad company id.");
    args.push("-CompanyId", opts.companyId);
  }
  const shell = process.platform === "win32" ? "pwsh" : "pwsh";
  let exp = await run(shell, args);
  if (!exp.ok && /ENOENT|not recognized/i.test(exp.out) && process.platform === "win32") exp = await run("powershell", args);
  steps.push({ step: "Export from Paperclip", ok: exp.ok, detail: exp.ok ? "Fresh export written to company/paperclip-export." : exp.out.split("\n").slice(-6).join("\n").slice(0, 800) });
  if (!exp.ok) return { steps };
  const restored = await dropStampOnlyChanges();
  if (restored) steps.push({ step: "Tidy", ok: true, detail: `Ignored ${restored} file(s) whose only change was Paperclip's bundled-skill commit stamp.` });
  const settings = saveOfficeSettings();
  if (settings.length) steps.push({ step: "Office settings", ok: true, detail: `Saved ${settings.map((n) => n.replace(".json", "")).join(", ")} to company/office-settings.` });
  if (!opts.commit) return { steps };

  const pending = (await git("status", "--porcelain")).out.split("\n").filter(Boolean);
  if (!pending.length) {
    steps.push({ step: "Commit", ok: true, detail: "Nothing changed since the last backup." });
  } else {
    const hits = await secretHits();
    if (hits.length) {
      steps.push({ step: "Secret check", ok: false, detail: `Not committed: these look like they contain a secret: ${hits.slice(0, 10).join(", ")}. Check them in company/ first.` });
      return { steps };
    }
    steps.push({ step: "Secret check", ok: true, detail: `${pending.length} changed file(s), nothing that looks like a secret.` });
    const add = await git("add", "-A");
    const msg = `Backup from the pixel office, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
    const commit = add.ok ? await git("commit", "-q", "-m", msg, "-m", `${TRAILER}: ${machineName()}`) : add;
    steps.push({ step: "Commit", ok: commit.ok, detail: commit.ok ? msg : commit.out.slice(0, 600) });
    if (!commit.ok) return { steps };
  }
  if (opts.push) {
    const push = await git("push", "-q");
    steps.push({ step: "Push", ok: push.ok, detail: push.ok ? "Pushed to the private repo." : push.out.slice(0, 600) });
  }
  return { steps };
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

let running = false;

export function backupBridge(): Plugin {
  return {
    name: "pixel-office-backup",
    configureServer(server) {
      server.middlewares.use("/office-admin/backup", async (req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          if (req.method === "GET") return res.end(JSON.stringify(await backupStatus()));
          if (req.method === "POST" && (req.url ?? "").startsWith("/restore-settings")) {
            const body = await readBody(req);
            return res.end(JSON.stringify({ restored: restoreOfficeSettings(!!body.overwrite) }));
          }
          if (req.method !== "POST") {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: "GET or POST" }));
          }
          if (running) {
            res.statusCode = 409;
            return res.end(JSON.stringify({ error: "A backup is already running." }));
          }
          running = true;
          try {
            const body = await readBody(req);
            res.end(JSON.stringify(await backupNow({ companyId: body.companyId ? String(body.companyId) : undefined, commit: !!body.commit, push: !!body.push })));
          } finally {
            running = false;
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
