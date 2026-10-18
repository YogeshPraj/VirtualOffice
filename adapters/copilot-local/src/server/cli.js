import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function fromPath(name, envPath) {
  const exts = isWin ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of (envPath ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, ext && !name.toLowerCase().endsWith(ext) ? name + ext : name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

// Locations Copilot CLI installers use, so the adapter works even when the
// Paperclip server was started from a shell whose PATH lacks the install.
function wellKnownLocations() {
  const out = [];
  const local = process.env.LOCALAPPDATA;
  if (isWin && local) {
    const pkgs = path.join(local, "Microsoft", "WinGet", "Packages");
    try {
      for (const d of fs.readdirSync(pkgs)) {
        if (/copilot/i.test(d)) out.push(path.join(pkgs, d, "copilot.exe"));
      }
    } catch {}
    out.push(path.join(local, "Microsoft", "WinGet", "Links", "copilot.exe"));
  }
  out.push(path.join(os.homedir(), ".local", "bin", "copilot"));
  return out;
}

/** Resolve the Copilot CLI executable: explicit config, COPILOT_CLI_PATH, PATH, then known install dirs. */
export function resolveCopilotCommand(configured, envPath = process.env.PATH) {
  const wanted = (configured && configured.trim()) || process.env.COPILOT_CLI_PATH || "copilot";
  if (path.isAbsolute(wanted) || wanted.includes("/") || wanted.includes("\\")) {
    return isFile(wanted) ? wanted : null;
  }
  const onPath = fromPath(wanted, envPath);
  if (onPath) return onPath;
  if (wanted !== "copilot") return null;
  return wellKnownLocations().find(isFile) ?? null;
}

export function copilotVersion(command) {
  const res = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 20000 });
  if (res.status !== 0) return null;
  return (res.stdout || "").split(/\r?\n/)[0]?.trim() || null;
}

/** Model currently selected in the user's Copilot config, if any. */
export function readConfiguredModel() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".copilot", "config.json"), "utf8");
    const parsed = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
    return typeof parsed.model === "string" && parsed.model ? parsed.model : null;
  } catch {
    return null;
  }
}
