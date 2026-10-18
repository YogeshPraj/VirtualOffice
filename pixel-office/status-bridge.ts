// Building status: one read-only health check of everything the office depends on, each with
// the fix for anything that isn't green. Runs on the office server (Node), never in the browser.
//
//   GET /office-admin/status -> { checkedAt, checks: StatusCheck[] }
//
// Every command here is fixed (no user input reaches a shell).

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { azCommand } from "./intake-bridge";

export interface StatusCheck {
  id: string;
  group: "services" | "employees" | "sign-ins" | "tools";
  label: string;
  level: "ok" | "warn" | "bad";
  detail: string;
  fix?: string;
}

const PAPERCLIP = "http://127.0.0.1:3100";
const BRAIN = "http://127.0.0.1:3131";
const REPO = resolve(__dirname, "..");

function run(cmd: string, args: string[], timeoutMs = 20_000): Promise<{ ok: boolean; out: string; missing: boolean }> {
  return new Promise((done) => {
    // npm-installed CLIs are .cmd shims on Windows, which need a shell; the arguments are constants.
    const shell = process.platform === "win32" && !/\.exe$/i.test(cmd);
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, shell }, (err, stdout, stderr) => {
      const text = `${stdout ?? ""}${stderr ?? ""}`.trim();
      const missing = !!err && ((err as NodeJS.ErrnoException).code === "ENOENT" || /not recognized|not found/i.test(text));
      done({ ok: !err, out: text, missing });
    });
  });
}

async function getJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const firstLine = (s: string) => s.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";

function pinnedPaperclip(): string | null {
  try {
    return readFileSync(join(REPO, "start-paperclip.ps1"), "utf8").match(/\$PaperclipVersion\s*=\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function checkPaperclip(): Promise<StatusCheck[]> {
  try {
    const h = (await getJson(`${PAPERCLIP}/api/health`)) as { status?: string; version?: string; authReady?: boolean; bootstrapStatus?: string };
    const pin = pinnedPaperclip();
    const off = pin && h.version && h.version !== pin;
    return [
      {
        id: "paperclip",
        group: "services",
        label: "Paperclip (the company's back office)",
        level: h.status === "ok" && !off ? "ok" : "warn",
        detail: `v${h.version ?? "?"}${off ? `, but setup pins v${pin}` : ""}${h.bootstrapStatus && h.bootstrapStatus !== "ready" ? ` · ${h.bootstrapStatus}` : ""}`,
        fix: off ? "Run stop-office.ps1, then launch the office again so the pinned version starts." : undefined,
      },
    ];
  } catch (e) {
    return [
      {
        id: "paperclip",
        group: "services",
        label: "Paperclip (the company's back office)",
        level: "bad",
        detail: `Not answering on 127.0.0.1:3100 (${(e as Error).message}).`,
        fix: "Double-click the Pixel Office desktop icon, or run start-paperclip.ps1.",
      },
    ];
  }
}

async function checkBrain(): Promise<StatusCheck> {
  const tokens = existsSync(join(REPO, ".brain"));
  try {
    const h = (await getJson(`${BRAIN}/health`)) as { status?: string; version?: string; engine?: string };
    return {
      id: "brain",
      group: "services",
      label: "Second brain (GBrain)",
      level: h.status === "ok" && tokens ? "ok" : "warn",
      detail: `v${h.version ?? "?"} on ${h.engine ?? "?"}${tokens ? "" : " · no access tokens in .brain/"}`,
      fix: tokens ? undefined : "Run setup.ps1 again to mint the brain tokens.",
    };
  } catch {
    return {
      id: "brain",
      group: "services",
      label: "Second brain (GBrain)",
      level: "warn",
      detail: "Not answering on 127.0.0.1:3131. Employees work without memory until it's back.",
      fix: "Run start-brain.ps1 (the desktop icon starts it too).",
    };
  }
}

function checkOffice(): StatusCheck {
  return { id: "office", group: "services", label: "Pixel office server", level: "ok", detail: `Node ${process.version}` };
}

async function checkAdapters(): Promise<StatusCheck[]> {
  try {
    const list = (await getJson(`${PAPERCLIP}/api/adapters`)) as { type: string; label: string; loaded: boolean; disabled: boolean }[];
    const want = ["claude_local", "copilot_local"];
    return want.map((type) => {
      const a = list.find((x) => x.type === type);
      const label = type === "claude_local" ? "Claude Code employees" : "Copilot employees";
      if (!a)
        return {
          id: `adapter:${type}`,
          group: "employees" as const,
          label,
          level: type === "copilot_local" ? ("warn" as const) : ("bad" as const),
          detail: "Adapter isn't installed in Paperclip.",
          fix: type === "copilot_local" ? "Run scripts/ensure-adapters.ps1 (the launcher does this)." : "Reinstall Paperclip with setup.ps1.",
        };
      if (a.disabled) return { id: `adapter:${type}`, group: "employees" as const, label, level: "warn" as const, detail: "Adapter is switched off.", fix: "Turn it back on in B1 → Generator · Adapters." };
      if (!a.loaded) return { id: `adapter:${type}`, group: "employees" as const, label, level: "bad" as const, detail: "Adapter failed to load.", fix: "Restart Paperclip; if it persists, run scripts/ensure-adapters.ps1." };
      return { id: `adapter:${type}`, group: "employees" as const, label, level: "ok" as const, detail: "Loaded." };
    });
  } catch {
    return []; // Paperclip down is already reported.
  }
}

async function checkClaude(): Promise<StatusCheck> {
  const v = await run("claude", ["--version"]);
  if (v.missing || !v.ok)
    return { id: "claude", group: "sign-ins", label: "Claude Code", level: "bad", detail: "The claude CLI isn't installed.", fix: "npm install -g @anthropic-ai/claude-code, then run claude once to sign in." };
  const signedIn = existsSync(join(homedir(), ".claude", ".credentials.json")) || !!process.env.ANTHROPIC_API_KEY;
  return {
    id: "claude",
    group: "sign-ins",
    label: "Claude Code",
    level: signedIn ? "ok" : "warn",
    detail: `${firstLine(v.out)}${signedIn ? " · signed in" : " · no saved sign-in found"}`,
    fix: signedIn ? undefined : "Open a terminal, run claude and sign in with your subscription.",
  };
}

async function checkCopilot(): Promise<StatusCheck> {
  const v = await run("copilot", ["--version"]);
  if (v.missing || !v.ok)
    return { id: "copilot", group: "sign-ins", label: "GitHub Copilot CLI", level: "warn", detail: "Not installed; Copilot employees can't work.", fix: "npm install -g @github/copilot, then run copilot and /login." };
  // Copilot keeps its sign-in in the OS credential store; the office's "Test employees" button
  // (Paperclip's adapter environment test) is what proves it actually works.
  return { id: "copilot", group: "sign-ins", label: "GitHub Copilot CLI", level: "ok", detail: `${firstLine(v.out)} · installed (use Test employees to check the sign-in)` };
}

async function checkGh(): Promise<StatusCheck> {
  const r = await run("gh", ["auth", "status"]);
  if (r.missing) return { id: "gh", group: "sign-ins", label: "GitHub CLI (gh)", level: "warn", detail: "Not installed: GitHub links can't be looked up or reported back.", fix: "winget install GitHub.cli, then gh auth login." };
  const who = r.out.match(/account (\S+)/)?.[1] ?? r.out.match(/as (\S+)/)?.[1];
  return r.ok
    ? { id: "gh", group: "sign-ins", label: "GitHub CLI (gh)", level: "ok", detail: who ? `Signed in as ${who}` : "Signed in" }
    : { id: "gh", group: "sign-ins", label: "GitHub CLI (gh)", level: "warn", detail: "Not signed in.", fix: "gh auth login" };
}

async function checkAz(): Promise<StatusCheck> {
  const az = azCommand();
  const acct = await run(az.cmd, [...az.prefix, "account", "show", "--query", "user.name", "--output", "tsv"], 30_000);
  if (acct.missing)
    return { id: "az", group: "sign-ins", label: "Azure CLI (Azure DevOps)", level: "warn", detail: "Not installed: ADO links are captured but not looked up.", fix: "winget install Microsoft.AzureCLI, then az extension add --name azure-devops, then az login." };
  if (!acct.ok) return { id: "az", group: "sign-ins", label: "Azure CLI (Azure DevOps)", level: "warn", detail: "Not signed in.", fix: "az login" };
  const ext = await run(az.cmd, [...az.prefix, "extension", "show", "--name", "azure-devops", "--query", "version", "--output", "tsv"], 30_000);
  return ext.ok
    ? { id: "az", group: "sign-ins", label: "Azure CLI (Azure DevOps)", level: "ok", detail: `Signed in as ${firstLine(acct.out)} · devops ext ${firstLine(ext.out)}` }
    : { id: "az", group: "sign-ins", label: "Azure CLI (Azure DevOps)", level: "warn", detail: `Signed in as ${firstLine(acct.out)}, but the azure-devops extension is missing.`, fix: "az extension add --name azure-devops" };
}

function checkGstack(): StatusCheck {
  const ok = existsSync(join(homedir(), ".claude", "skills", "gstack"));
  return ok
    ? { id: "gstack", group: "tools", label: "gstack skills", level: "ok", detail: "Installed for Claude Code employees." }
    : { id: "gstack", group: "tools", label: "gstack skills", level: "warn", detail: "Not installed.", fix: "Run setup.ps1 again." };
}

export async function buildingStatus(): Promise<StatusCheck[]> {
  const results = await Promise.all([checkPaperclip(), checkBrain(), checkAdapters(), checkClaude(), checkCopilot(), checkGh(), checkAz()]);
  return [checkOffice(), ...results.flat(), checkGstack()];
}

export function statusBridge(): Plugin {
  return {
    name: "pixel-office-status",
    configureServer(server) {
      server.middlewares.use("/office-admin/status", async (req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.method !== "GET") {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: "GET only" }));
        }
        try {
          res.end(JSON.stringify({ checkedAt: new Date().toISOString(), checks: await buildingStatus() }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
