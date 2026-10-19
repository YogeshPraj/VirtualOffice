// Self-healing: if Paperclip or the brain stops answering (PC slept, a crash, a closed window), the
// office server restarts it the same way the desktop launcher does, and keeps a short log.
//
//   GET /office-admin/watchdog -> { services: [{ id, up, failures }], events: WatchEvent[] }
//
// Guard rails: two failed checks in a row before acting, a cool-down between restarts of the same
// service, and at most a few restarts an hour (after that it stops and says so).

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ROOT = resolve(__dirname, "..");
const CHECK_MS = 60_000;

export interface WatchEvent {
  at: string;
  service: string;
  action: "restarted" | "recovered" | "gave-up" | "restart-failed";
  detail: string;
}

interface Service {
  id: "paperclip" | "brain";
  label: string;
  url: string;
  script: string;
  log: string;
}

const SERVICES: Service[] = [
  { id: "brain", label: "The second brain", url: "http://127.0.0.1:3131/health", script: "start-brain.ps1", log: ".brain-run.log" },
  { id: "paperclip", label: "Paperclip", url: "http://127.0.0.1:3100/api/health", script: "start-paperclip.ps1", log: ".paperclip-run.log" },
];

export interface Policy {
  failuresBeforeRestart: number;
  cooldownMs: number;
  maxPerHour: number;
}
export const POLICY: Policy = { failuresBeforeRestart: 2, cooldownMs: 5 * 60_000, maxPerHour: 3 };

export interface ServiceState {
  failures: number;
  restarts: number[]; // timestamps
  wasDown: boolean;
  gaveUp: boolean;
}

/** What to do after a health check: nothing, restart, give up, or note a recovery. */
export function decide(state: ServiceState, up: boolean, now: number, policy = POLICY): "none" | "restart" | "give-up" | "recovered" {
  if (up) return state.wasDown ? "recovered" : "none";
  if (state.gaveUp) return "none";
  if (state.failures + 1 < policy.failuresBeforeRestart) return "none";
  const recent = state.restarts.filter((t) => now - t < 3_600_000);
  if (recent.length >= policy.maxPerHour) return "give-up";
  const last = recent[recent.length - 1];
  if (last && now - last < policy.cooldownMs) return "none";
  return "restart";
}

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** PowerShell's -EncodedCommand: the script as base64 UTF-16LE, so no quoting can break it. */
export const encodeCommand = (script: string) => Buffer.from(script, "utf16le").toString("base64");

/**
 * Start a service exactly the way launch-office.ps1 does: PowerShell's Start-Process with a hidden
 * window. (A process spawned straight from this Node server doesn't reliably outlive its parent's
 * console on Windows; Start-Process gives it its own.)
 */
function startHidden(s: Service): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  const inner = encodeCommand(`$env:PAPERCLIP_NO_BROWSER='1'; & '${ROOT}\\${s.script}' *> '${ROOT}\\${s.log}'`);
  const outer = `Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${inner}') -WorkingDirectory '${ROOT}' -WindowStyle Hidden`;
  return new Promise((done) => {
    const child = spawn("pwsh", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", outer], { cwd: ROOT, stdio: "ignore", windowsHide: true });
    child.once("error", () => done(false));
    child.once("exit", (code) => done(code === 0));
  });
}

const state = new Map<string, ServiceState>(SERVICES.map((s) => [s.id, { failures: 0, restarts: [], wasDown: false, gaveUp: false }]));
const events: WatchEvent[] = [];
const log = (e: Omit<WatchEvent, "at">) => {
  events.push({ at: new Date().toISOString(), ...e });
  if (events.length > 50) events.shift();
  console.log(`[watchdog] ${e.service} ${e.action}: ${e.detail}`);
};

let checking = false;
async function check() {
  if (checking) return;
  checking = true;
  try {
    for (const s of SERVICES) {
      const st = state.get(s.id)!;
      const up = await healthy(s.url);
      const now = Date.now();
      const action = decide(st, up, now);
      if (up) {
        if (action === "recovered") log({ service: s.id, action: "recovered", detail: `${s.label} is answering again.` });
        state.set(s.id, { failures: 0, restarts: st.restarts, wasDown: false, gaveUp: false });
        continue;
      }
      const next: ServiceState = { ...st, failures: st.failures + 1, wasDown: true };
      if (action === "restart") {
        const ok = await startHidden(s);
        next.restarts = [...st.restarts.filter((t) => now - t < 3_600_000), now];
        next.failures = 0;
        log(ok ? { service: s.id, action: "restarted", detail: `${s.label} stopped answering; started it again.` } : { service: s.id, action: "restart-failed", detail: `${s.label} is down and couldn't be started (needs pwsh on Windows).` });
      } else if (action === "give-up") {
        next.gaveUp = true;
        log({ service: s.id, action: "gave-up", detail: `${s.label} keeps stopping (${POLICY.maxPerHour} restarts this hour). Check ${s.log}, then use the desktop icon.` });
      }
      state.set(s.id, next);
    }
  } finally {
    checking = false;
  }
}

export function watchdog(): Plugin {
  return {
    name: "pixel-office-watchdog",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer && !process.env.PIXEL_OFFICE_NO_WATCHDOG) {
        const t = setInterval(check, CHECK_MS);
        t.unref();
        server.httpServer.once("close", () => clearInterval(t));
      }
      server.middlewares.use("/office-admin/watchdog", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            services: SERVICES.map((s) => ({ id: s.id, label: s.label, ...state.get(s.id) })),
            events: [...events].reverse(),
          }),
        );
      });
    },
  };
}
