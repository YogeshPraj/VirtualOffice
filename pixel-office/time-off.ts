// Time off: send an employee on leave until a date. They're paused in Paperclip (no new shifts),
// and the office brings them back by itself on the morning of their return day, even if no
// browser is open. Kept in .office/leave.json (backed up with the other office settings).
//
//   GET    /office-admin/leave              -> { [agentId]: { until, reason, since } }
//   PUT    /office-admin/leave/<agentId>    { until: "YYYY-MM-DD", reason? } -> pauses them
//   DELETE /office-admin/leave/<agentId>    -> back now (resumes them)

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const PAPERCLIP = "http://127.0.0.1:3100/api";
const DIR = resolve(__dirname, "..", ".office");
const FILE = join(DIR, "leave.json");
const CHECK_MS = 10 * 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Leave {
  until: string; // back on this local day
  reason: string | null;
  since: string;
}
export type LeaveMap = Record<string, Leave>;

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Who is due back today (or earlier, if the office was off). */
export function dueBack(leave: LeaveMap, today = localDay()): string[] {
  return Object.entries(leave)
    .filter(([, l]) => l.until <= today)
    .map(([id]) => id);
}

/** A leave request that makes sense: a real date, in the future, within a year. */
export function validLeave(until: unknown, today = localDay()): string | null {
  if (typeof until !== "string" || !DATE.test(until)) return "Pick the day they're back.";
  if (until <= today) return "The return day has to be after today.";
  const [y, m, d] = today.split("-").map(Number);
  if (until > localDay(new Date(y + 1, m - 1, d))) return "Leave is limited to a year.";
  return null;
}

export function readLeave(file = FILE): LeaveMap {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeLeave(leave: LeaveMap) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(`${FILE}.tmp`, `${JSON.stringify(leave, null, 2)}\n`);
  renameSync(`${FILE}.tmp`, FILE);
}

async function post(path: string) {
  const r = await fetch(`${PAPERCLIP}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Bring back whoever's leave is over. Someone already resumed by hand just leaves the list. */
export async function returnFromLeave(today = localDay()) {
  const leave = readLeave();
  const back = dueBack(leave, today);
  if (!back.length) return [];
  const done: string[] = [];
  for (const id of back) {
    try {
      await post(`/agents/${id}/resume`);
      delete leave[id];
      done.push(id);
    } catch {
      /* Paperclip down: try again on the next check */
    }
  }
  if (done.length) writeLeave(leave);
  return done;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}

export function timeOff(): Plugin {
  return {
    name: "pixel-office-time-off",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer) {
        const t = setInterval(() => void returnFromLeave(), CHECK_MS);
        t.unref();
        server.httpServer.once("close", () => clearInterval(t));
        setTimeout(() => void returnFromLeave(), 30_000).unref();
      }
      server.middlewares.use("/office-admin/leave", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.end(JSON.stringify(body));
        };
        try {
          const id = (req.url ?? "/").split("?")[0].replace(/^\//, "");
          if (req.method === "GET" && !id) return send(200, readLeave());
          if (!UUID.test(id)) return send(400, { error: "Which employee?" });
          if (req.method === "PUT") {
            const body = await readJson(req);
            const problem = validLeave(body.until);
            if (problem) return send(400, { error: problem });
            await post(`/agents/${id}/pause`);
            const leave = readLeave();
            leave[id] = { until: String(body.until), reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 120) : null, since: new Date().toISOString() };
            writeLeave(leave);
            return send(200, leave);
          }
          if (req.method === "DELETE") {
            await post(`/agents/${id}/resume`);
            const leave = readLeave();
            delete leave[id];
            writeLeave(leave);
            return send(200, leave);
          }
          send(405, { error: "GET, PUT or DELETE" });
        } catch (e) {
          send(500, { error: (e as Error).message });
        }
      });
    },
  };
}
