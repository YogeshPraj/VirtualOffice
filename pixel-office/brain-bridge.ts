// Server-side bridge from the pixel office to the company's second brain (GBrain).
// Runs inside the Vite dev server, so the CEO-office token in ../.brain/ never reaches the
// browser. The brain itself is one shared local server (start-brain.ps1) on 127.0.0.1:3131.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const BRAIN = "http://127.0.0.1:3131";
const TOKEN_FILE = resolve(__dirname, "..", ".brain", "ceo-office.token");
const KINDS = new Set(["preference", "commitment", "fact", "event", "idea", "belief"]);

function token(): string {
  return readFileSync(TOKEN_FILE, "utf8").trim();
}

let nextId = 1;
async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BRAIN}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await res.text();
  // Streamable HTTP answers either as JSON or as an SSE stream with "data:" lines.
  const payload = raw.trimStart().startsWith("{")
    ? raw
    : raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() ?? "";
  const msg = JSON.parse(payload) as {
    result?: { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
    error?: { message: string };
  };
  if (msg.error) throw new Error(msg.error.message);
  const result = msg.result ?? {};
  const text = result.content?.find((c) => c.type === "text")?.text;
  const data = result.structuredContent ?? (text ? safeJson(text) : null);
  if (result.isError) throw new Error(errorText(data) ?? text ?? `${name} failed`);
  return data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function errorText(data: unknown): string | null {
  if (data && typeof data === "object") {
    const d = data as { message?: string; error?: string };
    return d.message ?? d.error ?? null;
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Cheap guard: the brain is readable by every agent, so secrets must never go in. */
const SECRET_PATTERNS = [
  /gbrain_[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/i,
];

export function brainBridge(): Plugin {
  return {
    name: "brain-bridge",
    configureServer(server) {
      server.middlewares.use("/brain", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://local");
        try {
          if (req.method === "GET" && url.pathname === "/status") {
            const health = await fetch(`${BRAIN}/health`).then((r) => r.json());
            return send(res, 200, { ok: true, ...health });
          }
          if (req.method === "GET" && url.pathname === "/recent") {
            const days = Math.min(365, Number(url.searchParams.get("days") ?? 90));
            return send(res, 200, await callTool("recall", { since: `${days} days ago`, limit: 200 }));
          }
          if (req.method === "GET" && url.pathname === "/ask") {
            const q = (url.searchParams.get("q") ?? "").slice(0, 500);
            if (!q.trim()) return send(res, 400, { error: "Ask something." });
            return send(res, 200, await callTool("recall", { question: q, limit: 30 }));
          }
          if (req.method === "POST" && url.pathname === "/remember") {
            const body = await readBody(req);
            const fact = String(body.fact ?? "").trim();
            const kind = String(body.kind ?? "fact");
            if (!fact) return send(res, 400, { error: "Write something to remember." });
            if (fact.length > 4000) return send(res, 400, { error: "Keep one fact under 4000 characters; split long notes." });
            if (!KINDS.has(kind)) return send(res, 400, { error: `Unknown kind ${kind}.` });
            if (SECRET_PATTERNS.some((p) => p.test(fact))) {
              return send(res, 400, {
                error: "That looks like a secret (token, key or password). Put it in the B1 Vault and write down only its name here.",
              });
            }
            const out = await callTool("remember", {
              fact,
              kind,
              entity: String(body.entity ?? "").trim() || "Company",
              provenance: String(body.provenance ?? "CEO, pixel office").slice(0, 500),
              content_origin: body.origin === "decision" ? "user_said" : "user_said",
            });
            return send(res, 200, out);
          }
          if (req.method === "POST" && url.pathname === "/forget") {
            const body = await readBody(req);
            return send(res, 200, await callTool("forget", { id: String(body.id), reason: String(body.reason ?? "Removed by the CEO") }));
          }
          send(res, 404, { error: "Unknown brain endpoint." });
        } catch (e) {
          const message = (e as Error).message;
          const down = /ECONNREFUSED|fetch failed/i.test(message);
          send(res, down ? 503 : 500, {
            error: down ? "The second brain isn't running. Double-click the Virtual Office icon (or run start-brain.ps1)." : message,
          });
        }
      });
    },
  };
}
