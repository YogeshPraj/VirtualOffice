// Watched queries: saved ADO queries / GitHub searches the office re-runs on a schedule. Matches
// that aren't tasks yet (and weren't dismissed) wait on the intake desk; nothing is created
// automatically. State lives in ../.office/watches.json (git-ignored).
//
//   GET  /office-admin/watches                 -> { watches: WatchView[] }
//   PUT  /office-admin/watches                 { watches: WatchDef[] }  (save definitions)
//   POST /office-admin/watches/<id>/run        -> run now
//   POST /office-admin/watches/<id>/dismiss    { urls: string[] }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { runQuery, type QueryHit } from "./intake-bridge";

const FILE = resolve(__dirname, "..", ".office", "watches.json");
const PAPERCLIP = "http://127.0.0.1:3100/api";
const MIN_EVERY = 5;
const MAX_WATCHES = 20;

export interface WatchDef {
  id: string;
  name: string;
  query: string;
  project: string;
  mine: boolean;
  everyMin: number;
}

interface WatchState extends WatchDef {
  lastRunAt: string | null;
  lastError: string | null;
  lastFix?: string | null;
  pending: QueryHit[];
  dismissed: string[];
}

function load(): WatchState[] {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as WatchState[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(list: WatchState[]) {
  if (!existsSync(dirname(FILE))) mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(list, null, 2));
}

export function cleanDef(d: Partial<WatchDef>, i: number): WatchDef {
  const id = String(d.id ?? "").replace(/[^\w-]/g, "").slice(0, 40) || `w${Date.now().toString(36)}${i}`;
  return {
    id,
    name: String(d.name ?? "").trim().slice(0, 80) || "Watched query",
    query: String(d.query ?? "").trim().slice(0, 5000),
    project: String(d.project ?? "").trim().slice(0, 500),
    mine: !!d.mine,
    everyMin: Math.max(MIN_EVERY, Math.min(24 * 60, Math.round(Number(d.everyMin) || 15))),
  };
}

/** Every source URL mentioned in any task description, across companies. */
async function knownUrls(): Promise<string> {
  const companies = (await (await fetch(`${PAPERCLIP}/companies`)).json()) as { id: string }[];
  const lists = await Promise.all(companies.map(async (c) => (await (await fetch(`${PAPERCLIP}/companies/${c.id}/issues`)).json()) as { description?: string | null; status: string }[]));
  return lists
    .flat()
    .filter((i) => i.status !== "cancelled")
    .map((i) => i.description ?? "")
    .join("\n");
}

/** Pending = matches that are neither tasks already nor dismissed. */
export function nextPending(prev: QueryHit[], hits: QueryHit[], dismissed: string[], known: string): QueryHit[] {
  const byUrl = new Map<string, QueryHit>();
  for (const h of [...prev, ...hits]) byUrl.set(h.url, h); // newer data wins
  const stillMatching = new Set(hits.map((h) => h.url));
  return [...byUrl.values()].filter((h) => stillMatching.has(h.url) && !dismissed.includes(h.url) && !known.includes(h.url));
}

async function runOne(w: WatchState, known?: string): Promise<WatchState> {
  const res = await runQuery({ query: w.query, project: w.project, mine: w.mine });
  const now = new Date().toISOString();
  if ("error" in res) return { ...w, lastRunAt: now, lastError: res.error, lastFix: res.fix ?? null };
  const k = known ?? (await knownUrls());
  return { ...w, lastRunAt: now, lastError: null, lastFix: null, pending: nextPending(w.pending, res.hits, w.dismissed, k) };
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const list = load();
    const due = list.filter((w) => !w.lastRunAt || Date.now() - Date.parse(w.lastRunAt) >= w.everyMin * 60_000);
    if (!due.length) return;
    const known = await knownUrls();
    const updated = new Map<string, WatchState>();
    for (const w of due) updated.set(w.id, await runOne(w, known));
    // Re-read in case the CEO edited watches while queries ran.
    save(load().map((w) => (updated.has(w.id) ? { ...updated.get(w.id)!, ...pickDef(w), pending: updated.get(w.id)!.pending.filter((h) => !w.dismissed.includes(h.url)) } : w)));
  } catch (e) {
    console.warn("[watches]", (e as Error).message);
  } finally {
    ticking = false;
  }
}

const pickDef = (w: WatchDef): WatchDef => ({ id: w.id, name: w.name, query: w.query, project: w.project, mine: w.mine, everyMin: w.everyMin });

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const view = (list: WatchState[]) => ({
  watches: list.map((w) => ({ ...pickDef(w), lastRunAt: w.lastRunAt, lastError: w.lastError, lastFix: w.lastFix ?? null, pending: w.pending })),
});

export function watchedQueries(): Plugin {
  return {
    name: "pixel-office-watched-queries",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer) {
        const timer = setInterval(tick, 60_000);
        timer.unref();
        server.httpServer.once("close", () => clearInterval(timer));
        setTimeout(tick, 15_000).unref();
      }
      server.middlewares.use("/office-admin/watches", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.end(JSON.stringify(body));
        };
        try {
          const parts = (req.url ?? "/").split("?")[0].split("/").filter(Boolean);
          if (req.method === "GET" && parts.length === 0) return send(200, view(load()));
          if (req.method === "PUT" && parts.length === 0) {
            const body = await readBody(req);
            const defs = (Array.isArray(body.watches) ? body.watches : []).slice(0, MAX_WATCHES).map((d, i) => cleanDef(d as Partial<WatchDef>, i));
            const old = load();
            const next: WatchState[] = defs.map((d) => {
              const prev = old.find((w) => w.id === d.id);
              const changed = !prev || prev.query !== d.query || prev.project !== d.project || prev.mine !== d.mine;
              // A changed query starts fresh; an edited name or interval keeps its results.
              return changed ? { ...d, lastRunAt: null, lastError: null, pending: [], dismissed: [] } : { ...prev, ...d };
            });
            save(next);
            setTimeout(tick, 100);
            return send(200, view(next));
          }
          if (req.method === "POST" && parts.length === 2) {
            const [id, action] = parts;
            const list = load();
            const w = list.find((x) => x.id === id);
            if (!w) return send(404, { error: "No such watch." });
            if (action === "run") {
              const updated = await runOne(w);
              const latest = load();
              save(latest.map((x) => (x.id === id ? { ...updated, ...pickDef(x) } : x)));
              return send(200, view(load()));
            }
            if (action === "dismiss") {
              const body = await readBody(req);
              const urls = (Array.isArray(body.urls) ? body.urls : []).map(String).slice(0, 500);
              save(list.map((x) => (x.id === id ? { ...x, dismissed: [...new Set([...x.dismissed, ...urls])].slice(-2000), pending: x.pending.filter((h) => !urls.includes(h.url)) } : x)));
              return send(200, view(load()));
            }
          }
          send(404, { error: "Unknown watches endpoint." });
        } catch (e) {
          send(500, { error: (e as Error).message });
        }
      });
    },
  };
}
