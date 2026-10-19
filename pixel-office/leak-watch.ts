// Leak watch: look through task descriptions, comments and documents for secrets someone pasted
// (tokens, keys, passwords), so they can be removed and rotated. Read-only scan; findings show a
// masked preview only, never the secret itself.
//
//   GET  /office-admin/leaks            -> last scan
//   POST /office-admin/leaks/scan       -> scan now

import type { Plugin } from "vite";

const PAPERCLIP = "http://127.0.0.1:3100/api";
const RESCAN_MS = 6 * 3_600_000;

/** What a secret looks like. Kept specific to avoid crying wolf on ordinary text. */
export const LEAK_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { label: "GBrain token", re: /\bgbrain_[A-Za-z0-9_-]{20,}\b/ },
  { label: "API key (sk-…)", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/ },
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Azure storage key", re: /AccountKey=[A-Za-z0-9+/]{40,}={0,2}/ },
  { label: "Azure DevOps / generic PAT", re: /\b(?:pat|token|api[_-]?key|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{32,}["']?/i },
  { label: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { label: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { label: "Password in a connection string", re: /\b(?:password|pwd)\s*=\s*[^;\s"']{6,}/i },
];

/** Already-redacted text ("***REDACTED***", "<token>") isn't a leak. */
const PLACEHOLDER = /\*{3}redacted\*{3}|<[a-z_ -]+>|\$\{?[A-Z_]+\}?|x{6,}|\.{3}|your[_-]?(token|key|password)/i;

export interface Finding {
  issueId: string;
  identifier: string;
  where: "description" | "comment" | "document";
  ref: string | null; // comment id or document key
  label: string;
  preview: string; // masked
  at: string | null;
}

/** "ghp_abcd…" style: enough to recognise, never enough to use. */
export function mask(s: string): string {
  const t = s.trim();
  return t.length <= 8 ? "••••" : `${t.slice(0, Math.min(6, Math.floor(t.length / 4)))}…(${t.length} chars)`;
}

export function findLeaks(text: string | null | undefined): { label: string; preview: string }[] {
  if (!text) return [];
  const out: { label: string; preview: string }[] = [];
  for (const p of LEAK_PATTERNS) {
    const m = text.match(p.re);
    if (m && !PLACEHOLDER.test(m[0])) out.push({ label: p.label, preview: mask(m[0]) });
  }
  return out;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${PAPERCLIP}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

let last: { scannedAt: string | null; findings: Finding[]; scanned: number; error: string | null; running: boolean } = { scannedAt: null, findings: [], scanned: 0, error: null, running: false };

export async function scan() {
  if (last.running) return last;
  last = { ...last, running: true };
  try {
    const companies = await get<{ id: string }[]>("/companies");
    const findings: Finding[] = [];
    let scanned = 0;
    for (const c of companies) {
      const issues = await get<{ id: string; identifier: string; description: string | null; status: string }[]>(`/companies/${c.id}/issues`);
      for (const i of issues) {
        if (i.status === "cancelled") continue;
        scanned++;
        for (const f of findLeaks(i.description)) findings.push({ issueId: i.id, identifier: i.identifier, where: "description", ref: null, ...f, at: null });
        const [comments, docs] = await Promise.all([
          get<{ id: string; body: string; createdAt: string }[]>(`/issues/${i.id}/comments`).catch(() => []),
          get<{ key: string; body: string; updatedAt: string }[]>(`/issues/${i.id}/documents`).catch(() => []),
        ]);
        for (const cm of comments) for (const f of findLeaks(cm.body)) findings.push({ issueId: i.id, identifier: i.identifier, where: "comment", ref: cm.id, ...f, at: cm.createdAt });
        for (const d of docs) for (const f of findLeaks(d.body)) findings.push({ issueId: i.id, identifier: i.identifier, where: "document", ref: d.key, ...f, at: d.updatedAt });
      }
    }
    last = { scannedAt: new Date().toISOString(), findings, scanned, error: null, running: false };
  } catch (e) {
    last = { ...last, error: (e as Error).message, running: false };
  }
  return last;
}

/** For Building status: none found, some found, or not scanned yet. */
export const leakSummary = () => ({ scannedAt: last.scannedAt, count: last.findings.length });

export function leakWatch(): Plugin {
  return {
    name: "pixel-office-leak-watch",
    configureServer(server) {
      if (!process.env.VITEST && server.httpServer) {
        const t = setInterval(() => void scan(), RESCAN_MS);
        t.unref();
        server.httpServer.once("close", () => clearInterval(t));
        setTimeout(() => void scan(), 90_000).unref();
      }
      server.middlewares.use("/office-admin/leaks", async (req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.method === "POST" && (req.url ?? "").startsWith("/scan")) return res.end(JSON.stringify(await scan()));
        if (req.method === "GET") return res.end(JSON.stringify(last));
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "GET or POST /scan" }));
      });
    },
  };
}
