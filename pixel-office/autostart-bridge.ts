// "Start with Windows": a shortcut to the launcher in the user's Startup folder, made or removed on
// request. Same shortcut as setup.ps1's desktop icon. Windows only.
//
//   GET /office-admin/autostart -> { supported, enabled }
//   PUT /office-admin/autostart { enabled }

import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const ROOT = resolve(__dirname, "..");
const NAME = "Virtual Office.lnk";

export function startupFolder(env = process.env): string | null {
  return env.APPDATA ? join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup") : null;
}

const linkPath = () => {
  const dir = startupFolder();
  return dir ? join(dir, NAME) : null;
};

/** PowerShell that writes the shortcut (paths passed as data, not spliced into code). */
export function shortcutScript(): string {
  return [
    "$shell = New-Object -ComObject WScript.Shell",
    "$lnk = $shell.CreateShortcut($env:VO_LINK)",
    "$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source",
    "if (-not $pwsh) { $pwsh = (Get-Command powershell).Source }",
    "$lnk.TargetPath = $pwsh",
    '$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$env:VO_ROOT\\launch-office.ps1`""',
    "$lnk.WorkingDirectory = $env:VO_ROOT",
    '$lnk.Description = "Start the Virtual Office when you sign in"',
    '$icon = Join-Path $env:VO_ROOT "assets\\office.ico"',
    "if (Test-Path $icon) { $lnk.IconLocation = \"$icon,0\" }",
    "$lnk.Save()",
  ].join("; ");
}

function create(): Promise<boolean> {
  const link = linkPath();
  if (!link) return Promise.resolve(false);
  return new Promise((done) => {
    execFile("pwsh", ["-NoProfile", "-NonInteractive", "-Command", shortcutScript()], { env: { ...process.env, VO_LINK: link, VO_ROOT: ROOT }, windowsHide: true, timeout: 30_000 }, (err) =>
      done(!err && existsSync(link)),
    );
  });
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function autostartBridge(): Plugin {
  return {
    name: "pixel-office-autostart",
    configureServer(server) {
      server.middlewares.use("/office-admin/autostart", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const supported = process.platform === "win32" && !!linkPath();
        try {
          if (req.method === "PUT") {
            if (!supported) throw new Error("Start with Windows needs Windows.");
            const { enabled } = await readBody(req);
            if (enabled) {
              if (!(await create())) throw new Error("Couldn't create the startup shortcut.");
            } else if (existsSync(linkPath()!)) rmSync(linkPath()!);
          } else if (req.method !== "GET") {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: "GET or PUT" }));
          }
          res.end(JSON.stringify({ supported, enabled: supported && existsSync(linkPath()!) }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
