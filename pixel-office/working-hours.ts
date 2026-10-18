// Working hours: optionally pause the company outside set hours, from the office server.
//
//   GET /office-admin/working-hours  -> { settings, now: { inHours, nextChange }, closedByOffice }
//   PUT /office-admin/working-hours  { enabled, days, start, end }
//
// After hours the office closes each active company (Paperclip's company "paused" status: no new
// work is picked up, shifts already running finish). At opening time it reopens only the
// companies it closed, so one the CEO closed by hand stays closed. Settings live in ../.office/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const PAPERCLIP = "http://127.0.0.1:3100/api";
const FILE = resolve(__dirname, "..", ".office", "working-hours.json");
const TICK_MS = 60_000;

export interface HoursSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  start: string; // "09:00"
  end: string; // "18:00"
}

interface StateFile {
  settings: HoursSettings;
  pausedByOffice: string[];
}

const DEFAULTS: HoursSettings = { enabled: false, days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function validSettings(s: Partial<HoursSettings>): HoursSettings {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULTS.days;
  const start = typeof s.start === "string" && time.test(s.start) ? s.start : DEFAULTS.start;
  const end = typeof s.end === "string" && time.test(s.end) ? s.end : DEFAULTS.end;
  if (start === end) throw new Error("Start and end can't be the same time.");
  return { enabled: !!s.enabled, days, start, end };
}

/** Is `at` inside working hours? An end before the start means an overnight shift. */
export function inHours(s: HoursSettings, at: Date): boolean {
  const m = at.getHours() * 60 + at.getMinutes();
  const a = minutes(s.start);
  const b = minutes(s.end);
  if (a < b) return s.days.includes(at.getDay()) && m >= a && m < b;
  // Overnight: the part after midnight belongs to the previous day's shift.
  if (m >= a) return s.days.includes(at.getDay());
  if (m < b) return s.days.includes((at.getDay() + 6) % 7);
  return false;
}

/** The next minute at which in/out of hours flips (searches a week ahead). */
export function nextChange(s: HoursSettings, from: Date): Date | null {
  const now = inHours(s, from);
  const t = new Date(from);
  t.setSeconds(0, 0);
  for (let i = 0; i < 7 * 24 * 60; i++) {
    t.setMinutes(t.getMinutes() + 1);
    if (inHours(s, t) !== now) return new Date(t);
  }
  return null;
}

function load(): StateFile {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<StateFile>;
    return { settings: validSettings(raw.settings ?? {}), pausedByOffice: Array.isArray(raw.pausedByOffice) ? raw.pausedByOffice.map(String) : [] };
  } catch {
    return { settings: DEFAULTS, pausedByOffice: [] };
  }
}

function save(state: StateFile) {
  if (!existsSync(dirname(FILE))) mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PAPERCLIP}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

interface CompanyRow {
  id: string;
  name: string;
  status: string;
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const state = load();
    const companies = await api<CompanyRow[]>("GET", "/companies");
    if (state.settings.enabled && !inHours(state.settings, new Date())) {
      // Closing the company stops new work; shifts already running finish normally.
      const open = companies.filter((c) => c.status === "active");
      if (!open.length) return;
      for (const c of open) {
        await api("PATCH", `/companies/${c.id}`, { status: "paused" });
        if (!state.pausedByOffice.includes(c.id)) state.pausedByOffice.push(c.id);
        console.log(`[working-hours] closed ${c.name} for the night`);
      }
    } else if (state.pausedByOffice.length) {
      for (const id of state.pausedByOffice) {
        const c = companies.find((x) => x.id === id);
        if (c?.status === "paused") {
          await api("PATCH", `/companies/${id}`, { status: "active" });
          console.log(`[working-hours] ${c.name} is open again`);
        }
      }
      state.pausedByOffice = [];
    } else return;
    save(state);
  } catch (e) {
    console.warn("[working-hours]", (e as Error).message);
  } finally {
    ticking = false;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function workingHours(): Plugin {
  return {
    name: "pixel-office-working-hours",
    configureServer(server) {
      // Only the real office server keeps the clock: never test runs (vitest loads this config too).
      if (!process.env.VITEST && server.httpServer) {
        const timer = setInterval(tick, TICK_MS);
        timer.unref();
        server.httpServer.once("close", () => clearInterval(timer));
        setTimeout(tick, 5_000).unref();
      }

      server.middlewares.use("/office-admin/working-hours", async (req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          if (req.method === "PUT") {
            const state = load();
            state.settings = validSettings((await readBody(req)) as Partial<HoursSettings>);
            save(state);
            setTimeout(tick, 100);
          } else if (req.method !== "GET") {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: "GET or PUT" }));
          }
          const state = load();
          const now = new Date();
          let companies: CompanyRow[] = [];
          try {
            companies = await api<CompanyRow[]>("GET", "/companies");
          } catch {
            /* Paperclip down: preview unavailable */
          }
          res.end(
            JSON.stringify({
              settings: state.settings,
              now: { inHours: inHours(state.settings, now), nextChange: nextChange(state.settings, now)?.toISOString() ?? null },
              closedByOffice: companies.filter((c) => state.pausedByOffice.includes(c.id) && c.status === "paused").map((c) => c.name),
            }),
          );
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
