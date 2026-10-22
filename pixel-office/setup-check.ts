// Setup check: is this machine ready to run the office? Looks for the tools setup.ps1 installs and
// the sign-ins employees need, and says how to fix each gap. Read-only; never prints tokens or
// account details.
//
//   GET /office-admin/setup-check   (?force=1 to skip the one-minute cache)

import { exec } from "node:child_process";
import { existsSync, readFileSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { officeEngine } from "./ask-office";

const ROOT = resolve(__dirname, "..");
const CACHE_MS = 60_000;

export type Level = "ok" | "warn" | "bad";
export interface Check {
  id: string;
  label: string;
  level: Level;
  detail: string;
  fix?: string;
}

/** Run a command; resolve with its output, or null if it isn't there or fails. */
function run(cmd: string, timeout = 20_000): Promise<string | null> {
  return new Promise((done) => {
    exec(cmd, { timeout, windowsHide: true, cwd: ROOT }, (err, stdout) => done(err ? null : stdout.trim()));
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(4_000) });
    return true;
  } catch {
    return false;
  }
}

/** Does this MCP config file register the brain? Key names only, never values. */
export function hasBrain(configText: string | null): boolean {
  if (!configText) return false;
  try {
    const c = JSON.parse(configText.replace(/^\s*\/\/.*$/gm, ""));
    return Boolean(c?.mcpServers && Object.keys(c.mcpServers).some((k) => /gbrain/i.test(k)));
  } catch {
    return false;
  }
}

/** `claude auth status` output → signed in? (Reads one flag; the rest is ignored.) */
export function claudeSignedIn(out: string | null): boolean | null {
  if (!out) return null;
  try {
    return JSON.parse(out).loggedIn === true;
  } catch {
    return /logged in/i.test(out) && !/not logged in/i.test(out);
  }
}

/** Free space in GB → a check. */
export function diskCheck(freeGb: number | null): Check {
  if (freeGb === null) return { id: "disk", label: "Disk space", level: "warn", detail: "Couldn't read free space." };
  const detail = `${freeGb.toFixed(1)} GB free on the office's drive.`;
  if (freeGb < 2) return { id: "disk", label: "Disk space", level: "bad", detail, fix: "Free some space: the database and employees' workspaces need room to grow." };
  if (freeGb < 10) return { id: "disk", label: "Disk space", level: "warn", detail, fix: "Getting low; keep an eye on it." };
  return { id: "disk", label: "Disk space", level: "ok", detail };
}

const read = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

export async function runChecks(): Promise<Check[]> {
  const home = homedir();
  const rerun = "Run `pwsh -ExecutionPolicy Bypass -File .\\setup.ps1` again (finished steps are skipped).";
  const [psMajor, git, claudeVer, claudeAuth, copilotVer, paperclip, brain] = await Promise.all([
    run('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.Major"'),
    run("git --version"),
    run("claude --version"),
    run("claude auth status"),
    run("copilot --version"),
    answers("http://127.0.0.1:3100/api/health"),
    answers("http://127.0.0.1:3131/"),
  ]);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  const ps = Number(psMajor);
  add(ps >= 7 ? { id: "pwsh", label: "PowerShell 7", level: "ok", detail: `PowerShell ${ps}.` } : { id: "pwsh", label: "PowerShell 7", level: "bad", detail: "pwsh isn't on the PATH.", fix: "Install PowerShell 7: `winget install Microsoft.PowerShell`." });
  add(git ? { id: "git", label: "Git", level: "ok", detail: git } : { id: "git", label: "Git", level: "bad", detail: "git isn't on the PATH.", fix: "Install Git for Windows: `winget install Git.Git`." });
  add(existsSync(join(ROOT, ".tools", "node", "node.exe")) || process.platform !== "win32"
    ? { id: "node", label: "Office runtime (Node)", level: "ok", detail: "Portable Node is in .tools." }
    : { id: "node", label: "Office runtime (Node)", level: "bad", detail: "No portable Node in .tools.", fix: rerun });

  const signedIn = claudeSignedIn(claudeAuth);
  if (!claudeVer) add({ id: "claude", label: "Claude Code", level: copilotVer ? "warn" : "bad", detail: "The claude command isn't installed.", fix: "Install Claude Code (`npm i -g @anthropic-ai/claude-code` or the Windows installer) if any employee runs on Claude." });
  else if (signedIn === false) add({ id: "claude", label: "Claude Code", level: "bad", detail: `${claudeVer}, not signed in.`, fix: "Run `claude auth login` once." });
  else add({ id: "claude", label: "Claude Code", level: signedIn ? "ok" : "warn", detail: signedIn ? `${claudeVer}, signed in.` : `${claudeVer}; couldn't tell if it's signed in.`, fix: signedIn ? undefined : "If Claude employees fail to start, run `claude auth login`." });
  add(copilotVer
    ? { id: "copilot", label: "Copilot CLI", level: "ok", detail: `${copilotVer.split("\n")[0].replace(/\.$/, "")} (sign-in lives in Windows Credential Manager, so it isn't checked here).`, fix: "If Copilot employees fail to start, run `copilot login`." }
    : { id: "copilot", label: "Copilot CLI", level: claudeVer ? "warn" : "bad", detail: "The copilot command isn't installed.", fix: "Only needed for employees on Copilot: `npm i -g @github/copilot`." });

  // The office's own read-only AI calls (Ask the office, briefing, handovers, meeting drafts).
  const engine = officeEngine(process.env, (cmd) => (cmd === "claude" ? !!claudeVer : cmd === "copilot" ? !!copilotVer : false));
  add(engine
    ? { id: "office-ai", label: "Office AI", level: "ok", detail: `Ask the office, the briefing and meeting drafts use ${engine === "claude" ? "Claude Code" : "GitHub Copilot CLI"}${process.env.VIRTUAL_OFFICE_AI ? " (set by VIRTUAL_OFFICE_AI)" : ""}.` }
    : { id: "office-ai", label: "Office AI", level: "warn", detail: "Neither Claude Code nor Copilot CLI is installed, so Ask the office, the briefing and meeting drafts can't run.", fix: "Install one of them and sign in." });
  add(existsSync(join(home, ".claude", "skills", "gstack"))
    ? { id: "gstack", label: "gstack skills", level: "ok", detail: "Installed for Claude Code." }
    : { id: "gstack", label: "gstack skills", level: "warn", detail: "Not installed in ~/.claude/skills.", fix: rerun });

  const tokens = existsSync(join(ROOT, ".brain", "ceo-office.token")) && existsSync(join(ROOT, ".brain", "employees.token"));
  add(!tokens
    ? { id: "brain", label: "Second brain", level: "bad", detail: "No brain tokens in .brain.", fix: rerun }
    : brain
      ? { id: "brain", label: "Second brain", level: "ok", detail: "Running on port 3131." }
      : { id: "brain", label: "Second brain", level: "warn", detail: "Tokens are set up but the brain isn't answering.", fix: "The office restarts it on its own; or run `pwsh start-brain.ps1`." });
  const wired = [hasBrain(read(join(home, ".claude.json"))) && "Claude Code", hasBrain(read(join(home, ".copilot", "mcp-config.json"))) && "Copilot"].filter(Boolean);
  add(wired.length
    ? { id: "brain-mcp", label: "Brain connected", level: "ok", detail: `Connected to ${wired.join(" and ")}.` }
    : { id: "brain-mcp", label: "Brain connected", level: "warn", detail: "Neither Claude Code nor Copilot knows about the brain.", fix: rerun });

  add(paperclip
    ? { id: "paperclip", label: "Paperclip", level: "ok", detail: "Answering on port 3100." }
    : { id: "paperclip", label: "Paperclip", level: "bad", detail: "Not answering on port 3100.", fix: "The office restarts it on its own; or run `pwsh start-paperclip.ps1`. If another app holds port 3100, close it." });

  let free: number | null = null;
  try {
    const s = statfsSync(ROOT);
    free = (s.bavail * s.bsize) / 1e9;
  } catch {
    // older Node or unsupported drive
  }
  add(diskCheck(free));

  add(existsSync(join(ROOT, "company", ".git"))
    ? { id: "company", label: "Company repo", level: "ok", detail: "Your private company repo is checked out in company/." }
    : { id: "company", label: "Company repo", level: "warn", detail: "No private company repo in company/ (optional).", fix: "To bring your company and its backups along, clone your private repo into company/." });
  return checks;
}

let cache: { at: number; checks: Check[] } | null = null;

export function setupCheck(): Plugin {
  return {
    name: "pixel-office-setup-check",
    configureServer(server) {
      server.middlewares.use("/office-admin/setup-check", async (req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.method !== "GET") {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: "GET only" }));
        }
        const force = (req.url ?? "").includes("force=1");
        if (force || !cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), checks: await runChecks() };
        res.end(JSON.stringify({ checkedAt: new Date(cache.at).toISOString(), checks: cache.checks }));
      });
    },
  };
}
