// Source drift: the office re-checks the ADO / GitHub items tasks are about, so the CEO hears
// when one is closed, merged or reopened outside the office. Read-only (az / gh lookups).
//
//   GET  /office-admin/sources            -> { sources: Record<url, SourceState> }
//   POST /office-admin/sources/check      { urls } -> check these now
//
// Cache: ../.office/sources.json (git-ignored).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { parseLink, resolveLinks } from "./intake-bridge";

const FILE = resolve(__dirname, "..", ".office", "sources.json");
const PAPERCLIP = "http://127.0.0.1:3100/api";
const RECHECK_MS = 30 * 60_000;
const PER_TICK = 15;
const DONE_WINDOW_MS = 14 * 86_400_000; // finished tasks are still worth watching for a reopen

export interface SourceState {
  state: string | null;
  closed: boolean | null;
  checkedAt: string;
  /** When `closed` last flipped. */
  changedAt: string | null;
  error: string | null;
}

/** ADO and GitHub states that mean "nothing left to do here". */
export function isClosedState(state: string | null | undefined): boolean | null {
  if (!state) return null;
  return /^(closed|done|removed|resolved|completed|merged|cut|abandoned|won'?t fix)$/i.test(state.trim());
}

const URL_RE = /https:\/\/(?:dev\.azure\.com|[^.\s/]+\.visualstudio\.com|github\.com)\/[^\s)>\]]+/gi;

/** Source links of tasks worth watching: open ones, and ones finished recently. */
export function watchedUrls(issues: { description?: string | null; status: string; updatedAt: string }[], now = Date.now()): string[] {
  const urls = new Set<string>();
  for (const i of issues) {
    if (i.status === "cancelled") continue;
    if (i.status === "done" && now - Date.parse(i.updatedAt) > DONE_WINDOW_MS) continue;
    for (const m of (i.description ?? "").matchAll(URL_RE)) {
      const p = parseLink(m[0]);
      if (p && p.source !== "link") urls.add(p.url);
    }
  }
  return [...urls];
}

function load(): Record<string, SourceState> {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, SourceState>;
  } catch {
    return {};
  }
}

function save(map: Record<string, SourceState>) {
  if (!existsSync(dirname(FILE))) mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(map, null, 2));
}

async function check(urls: string[]): Promise<Record<string, SourceState>> {
  const map = load();
  if (!urls.length) return map;
  const { items } = await resolveLinks(urls);
  const now = new Date().toISOString();
  for (const it of items) {
    const prev = map[it.url];
    const closed = it.error ? (prev?.closed ?? null) : isClosedState(it.state);
    map[it.url] = {
      state: it.error ? (prev?.state ?? null) : (it.state ?? null),
      closed,
      checkedAt: now,
      changedAt: prev && prev.closed !== null && closed !== null && prev.closed !== closed ? now : (prev?.changedAt ?? null),
      error: it.error ?? null,
    };
  }
  save(map);
  return map;
}

async function allIssues() {
  const companies = (await (await fetch(`${PAPERCLIP}/companies`)).json()) as { id: string }[];
  const lists = await Promise.all(companies.map(async (c) => (await (await fetch(`${PAPERCLIP}/companies/${c.id}/issues`)).json()) as { description?: string | null; status: string; updatedAt: string }[]));
  return lists.flat();
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const map = load();
    const due = watchedUrls(await allIssues())
      .filter((u) => !map[u] || Date.now() - Date.parse(map[u].checkedAt) > RECHECK_MS)
      .sort((a, b) => Date.parse(map[a]?.checkedAt ?? "0") - Date.parse(map[b]?.checkedAt ?? "0"))
      .slice(0, PER_TICK);
    if (due.length) await check(due);
  } catch (e) {
    console.warn("[sources]", (e as Error).message);
  } finally {
    ticking = false;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function sourceDrift(): Plugin {
  return {
    name: "pixel-office-source-drift",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer) {
        const timer = setInterval(tick, 5 * 60_000);
        timer.unref();
        server.httpServer.once("close", () => clearInterval(timer));
        setTimeout(tick, 30_000).unref();
      }
      server.middlewares.use("/office-admin/sources", async (req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          const path = (req.url ?? "/").split("?")[0];
          if (req.method === "GET" && (path === "/" || path === "")) return res.end(JSON.stringify({ sources: load() }));
          if (req.method === "POST" && path === "/check") {
            const body = await readBody(req);
            const urls = (Array.isArray(body.urls) ? body.urls : []).map(String).filter((u) => parseLink(u)?.source !== "link").slice(0, 30);
            return res.end(JSON.stringify({ sources: await check(urls) }));
          }
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Unknown sources endpoint." }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
