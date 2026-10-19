// Phone view: a small, separate web server for your phone, so you can clear the review queue
// away from the desk. Safety rules:
//   - off until you turn it on in Building status;
//   - it listens only on this machine's Tailscale address (your private network), never on the
//     LAN or the internet, and refuses to start without one;
//   - every request carries a secret token from the link you open once on the phone (only its
//     hash is stored); too many wrong tokens lock it for a while;
//   - it can do a handful of things only (read the review queue and what's waiting, approve,
//     send back, comment), never the rest of Paperclip's API.
//
// Admin (local office only):
//   GET  /office-admin/phone                       -> { enabled, running, address, port, reason }
//   POST /office-admin/phone { enabled: boolean }  -> turning it on returns the phone link (once)
//   POST /office-admin/phone/regenerate            -> new link; the old one stops working

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

const PAPERCLIP = "http://127.0.0.1:3100/api";
const DIR = resolve(__dirname, "..", ".office");
const FILE = join(DIR, "phone.json");
const PORT = 5181;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FAILURES = 10;
const LOCK_MS = 10 * 60_000;

interface Config {
  enabled: boolean;
  tokenHash: string | null;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Tailscale hands out addresses in 100.64.0.0/10. */
export function isTailscale(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function tailscaleAddress(nets = networkInterfaces()): string | null {
  for (const list of Object.values(nets)) for (const n of list ?? []) if (n.family === "IPv4" && !n.internal && isTailscale(n.address)) return n.address;
  return null;
}

/** Constant-time check of a presented token against the stored hash. */
export function tokenMatches(presented: string | null | undefined, hashHex: string | null): boolean {
  if (!presented || !hashHex) return false;
  const want = Buffer.from(hashHex, "hex");
  const got = sha(presented);
  return want.length === got.length && timingSafeEqual(want, got);
}

function readConfig(): Config {
  try {
    const c = JSON.parse(readFileSync(FILE, "utf8"));
    return { enabled: !!c.enabled, tokenHash: typeof c.tokenHash === "string" ? c.tokenHash : null };
  } catch {
    return { enabled: false, tokenHash: null };
  }
}
function writeConfig(c: Config) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(c, null, 2)}\n`);
}

async function pc<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${PAPERCLIP}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (r.status === 204 ? null : r.json()) as Promise<T>;
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 16_384) throw new Error("Too big.");
  }
  return raw ? JSON.parse(raw) : {};
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  workMode?: string;
  hiddenAt?: string | null;
  updatedAt: string;
}

/** The phone's API: a short allow-list, each mapped onto Paperclip by the office. */
export async function handlePhone(method: string, path: string, read: () => Promise<Record<string, unknown>>): Promise<{ status: number; body: unknown }> {
  const companies = await pc<{ id: string; name: string; issuePrefix: string }[]>("/companies");
  const company = companies[0];
  if (!company) return { status: 404, body: { error: "No company yet." } };
  const agents = await pc<{ id: string; name: string }[]>(`/companies/${company.id}/agents`);
  const name = (id: string | null) => (id ? (agents.find((a) => a.id === id)?.name ?? "Someone") : "Unassigned");

  if (method === "GET" && path === "/m/home") {
    const [issues, attention] = await Promise.all([pc<Issue[]>(`/companies/${company.id}/issues`), pc<{ items: { subject: { id: string; kind: string; title: string; identifier: string | null } }[] }>(`/companies/${company.id}/attention`).catch(() => ({ items: [] }))]);
    const review = issues
      .filter((i) => i.status === "in_review" && i.workMode !== "ask" && !i.hiddenAt)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, who: name(i.assigneeAgentId), priority: i.priority }));
    const waiting = attention.items.map((a) => ({ id: a.subject.kind === "issue" ? a.subject.id : null, identifier: a.subject.identifier, title: a.subject.title }));
    return { status: 200, body: { company: company.name, review, waiting } };
  }

  const m = path.match(/^\/m\/task\/([^/]+)(?:\/(approve|send-back|comment))?$/);
  if (!m || !UUID.test(m[1])) return { status: 404, body: { error: "Not here." } };
  const id = m[1];
  const issue = await pc<Issue & { companyId: string; description: string | null }>(`/issues/${id}`);
  if (issue.companyId !== company.id) return { status: 404, body: { error: "Not here." } };

  if (method === "GET" && !m[2]) {
    const comments = await pc<{ body: string; authorAgentId: string | null; createdAt: string }[]>(`/issues/${id}/comments`);
    return {
      status: 200,
      body: {
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        who: name(issue.assigneeAgentId),
        description: (issue.description ?? "").slice(0, 4000),
        comments: comments.slice(-6).map((c) => ({ who: c.authorAgentId ? name(c.authorAgentId) : "You", at: c.createdAt, body: c.body.slice(0, 4000) })),
      },
    };
  }
  if (method !== "POST" || !m[2]) return { status: 405, body: { error: "Not allowed." } };
  const b = await read();
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 4000) : "";
  const say = (text: string) => pc(`/issues/${id}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
  if (m[2] === "comment") {
    if (!note) return { status: 400, body: { error: "Write something first." } };
    await say(note);
    return { status: 200, body: { ok: true } };
  }
  if (issue.status !== "in_review") return { status: 409, body: { error: `${issue.identifier} isn't waiting for review any more.` } };
  if (m[2] === "approve") {
    if (note) await say(`**Approved by the CEO (from the phone).** ${note}`);
    await pc(`/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
    return { status: 200, body: { ok: true } };
  }
  if (!note) return { status: 400, body: { error: "Say what needs changing." } };
  await say(`**Sent back by the CEO (from the phone):** ${note}`);
  await pc(`/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status: "todo" }) });
  if (issue.assigneeAgentId)
    await pc(`/agents/${issue.assigneeAgentId}/wakeup`, { method: "POST", body: JSON.stringify({ source: "on_demand", triggerDetail: "manual", reason: "The CEO sent this back from review with notes", payload: { issueId: id }, forceFreshSession: false }) }).catch(() => undefined);
  return { status: 200, body: { ok: true } };
}

let server: Server | null = null;
let address: string | null = null;
let failures: number[] = [];
/** For tests: forget wrong-token attempts. */
export const resetLockout = () => (failures = []);

const send = (res: ServerResponse, status: number, data: unknown, type = "application/json") => {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
  });
  res.end(type === "application/json" ? JSON.stringify(data) : (data as string));
};

/** Start the gateway on `host` (the Tailscale address; tests pass 127.0.0.1). */
export function startGateway(
  host: string,
  port = PORT,
  opts: { tokenHash?: () => string | null; handle?: typeof handlePhone } = {},
): Promise<Server> {
  const tokenHash = opts.tokenHash ?? (() => readConfig().tokenHash);
  const handle = opts.handle ?? handlePhone;
  return new Promise((done, fail) => {
    const s = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://phone");
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, PHONE_HTML, "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/app.js") return send(res, 200, PHONE_JS, "text/javascript; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/app.css") return send(res, 200, PHONE_CSS, "text/css; charset=utf-8");
      if (!url.pathname.startsWith("/m/")) return send(res, 404, { error: "Not here." });
      const now = Date.now();
      failures = failures.filter((t) => now - t < LOCK_MS);
      if (failures.length >= MAX_FAILURES) return send(res, 429, { error: "Too many wrong links. Try again in a few minutes." });
      const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? null;
      if (!tokenMatches(auth, tokenHash())) {
        failures.push(now);
        return send(res, 401, { error: "This phone isn't connected. Open the link from Building status again." });
      }
      try {
        const r = await handle(req.method ?? "GET", url.pathname, () => body(req));
        send(res, r.status, r.body);
      } catch (e) {
        send(res, 502, { error: (e as Error).message });
      }
    });
    s.once("error", fail);
    s.listen(port, host, () => done(s));
  });
}

async function stop() {
  if (server) await new Promise((r) => server!.close(() => r(null)));
  server = null;
  address = null;
}

async function syncRunning(): Promise<string | null> {
  const c = readConfig();
  if (!c.enabled || !c.tokenHash) {
    await stop();
    return null;
  }
  const ip = tailscaleAddress();
  if (!ip) {
    await stop();
    return "Tailscale isn't running on this machine, so the phone view stays off (it never listens on the LAN or the internet).";
  }
  if (server && address === ip) return null;
  await stop();
  try {
    server = await startGateway(ip);
    address = ip;
    return null;
  } catch (e) {
    return `Couldn't listen on ${ip}:${PORT} (${(e as Error).message}).`;
  }
}

const newToken = () => randomBytes(32).toString("base64url");

export function phoneGateway(): Plugin {
  return {
    name: "pixel-office-phone-gateway",
    configureServer(vite) {
      if (!process.env.VITEST && vite.httpServer) {
        void syncRunning();
        // Tailscale can come and go (sleep, sign-out): follow it.
        const t = setInterval(() => void syncRunning(), 60_000);
        t.unref();
        vite.httpServer.once("close", () => {
          clearInterval(t);
          void stop();
        });
      }
      vite.middlewares.use("/office-admin/phone", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const reply = (status: number, data: unknown) => {
          res.statusCode = status;
          res.end(JSON.stringify(data));
        };
        try {
          const sub = (req.url ?? "/").split("?")[0];
          let link: string | null = null;
          if (req.method === "POST") {
            const b = sub === "/regenerate" ? { enabled: true } : await body(req);
            if (b.enabled) {
              const token = newToken();
              writeConfig({ enabled: true, tokenHash: sha(token).toString("hex") });
              const ip = tailscaleAddress();
              link = ip ? `http://${ip}:${PORT}/#t=${token}` : null;
            } else writeConfig({ enabled: false, tokenHash: null });
          } else if (req.method !== "GET") return reply(405, { error: "GET or POST" });
          const reason = await syncRunning();
          const c = readConfig();
          reply(200, { enabled: c.enabled, running: !!server, address, port: PORT, reason, link });
        } catch (e) {
          reply(500, { error: (e as Error).message });
        }
      });
    },
  };
}

// ---- The phone page: plain HTML, CSS and JS, served by the gateway itself. ----

export const PHONE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office on the go</title><link rel="stylesheet" href="/app.css"></head>
<body><header><h1 id="co">Office</h1><button id="refresh" aria-label="Refresh">↻</button></header>
<main id="main"><p class="muted">Loading…</p></main><script src="/app.js"></script></body></html>`;

export const PHONE_CSS = `:root{color-scheme:light dark;--bg:#f6f1e7;--card:#fffaf0;--ink:#1e1a24;--muted:#6b6255;--accent:#c58a00;--good:#1d7a55;--bad:#b23a3a}
@media (prefers-color-scheme:dark){:root{--bg:#1b1d23;--card:#262a33;--ink:#ece4d4;--muted:#a99f8f;--accent:#f5c542;--good:#3fbf8a;--bad:#ff7b7b}}
*{box-sizing:border-box}body{margin:0;font:17px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--card);border-bottom:3px solid var(--ink)}
h1{flex:1;font-size:18px;margin:0}h2{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:18px 0 6px}
main{padding:0 16px 40px;max-width:640px;margin:0 auto}.card{background:var(--card);border:2px solid var(--ink);padding:12px;margin:8px 0;border-radius:4px}
button{font:inherit;border:2px solid var(--ink);background:var(--card);color:var(--ink);padding:10px 14px;border-radius:4px;min-height:44px}
button.good{background:var(--good);color:#fff;border-color:var(--good)}button.wide{width:100%;text-align:left}
textarea{width:100%;min-height:90px;font:inherit;padding:8px;border:2px solid var(--ink);border-radius:4px;background:var(--bg);color:var(--ink)}
.row{display:flex;gap:8px;margin-top:8px}.row>*{flex:1}.muted{color:var(--muted)}.id{font-size:13px;color:var(--muted)}
.c{border-left:4px solid var(--accent);padding-left:8px;margin:8px 0;white-space:pre-wrap;word-wrap:break-word}.err{color:var(--bad)}`;

export const PHONE_JS = `(function(){
var m=location.hash.match(/t=([A-Za-z0-9_-]+)/);
try{if(m){localStorage.setItem("vo-phone",m[1]);history.replaceState(null,"","/");}}catch(e){}
var token=null;try{token=localStorage.getItem("vo-phone");}catch(e){}
var main=document.getElementById("main");
function el(tag,attrs,kids){var e=document.createElement(tag);for(var k in attrs||{}){if(k==="text")e.textContent=attrs[k];else if(k==="onclick")e.onclick=attrs[k];else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){e.appendChild(c)});return e;}
function api(path,body){return fetch(path,{method:body?"POST":"GET",headers:{"Authorization":"Bearer "+(token||""),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||("HTTP "+r.status));return d;});});}
function fail(e){main.replaceChildren(el("p",{"class":"err",text:e.message}));}
function home(){api("/m/home").then(function(d){document.getElementById("co").textContent=d.company;var kids=[el("h2",{text:"Waiting for your review ("+d.review.length+")"})];
if(!d.review.length)kids.push(el("p",{"class":"muted",text:"Nothing to review."}));
d.review.forEach(function(t){kids.push(el("button",{"class":"wide card",onclick:function(){task(t.id)}},[el("div",{"class":"id",text:t.identifier+" · "+t.who+" · "+t.priority}),el("div",{text:t.title})]))});
kids.push(el("h2",{text:"Waiting on you ("+d.waiting.length+")"}));
if(!d.waiting.length)kids.push(el("p",{"class":"muted",text:"Nothing else."}));
d.waiting.forEach(function(w){kids.push(el(w.id?"button":"div",{"class":"wide card",onclick:w.id?function(){task(w.id)}:null},[el("div",{"class":"id",text:w.identifier||""}),el("div",{text:w.title})]))});
main.replaceChildren.apply(main,kids);}).catch(fail);}
function task(id){api("/m/task/"+id).then(function(t){var note=el("textarea",{placeholder:"A note (needed to send back)"});var kids=[el("button",{onclick:home,text:"◀ Back"}),el("div",{"class":"card"},[el("div",{"class":"id",text:t.identifier+" · "+t.who+" · "+t.status.replace("_"," ")}),el("strong",{text:t.title})])];
t.comments.forEach(function(c){kids.push(el("div",{"class":"c"},[el("div",{"class":"id",text:c.who+" · "+new Date(c.at).toLocaleString()}),el("div",{text:c.body})]))});
kids.push(note);var row=el("div",{"class":"row"});
function act(kind,label,cls){row.appendChild(el("button",{"class":cls||"",text:label,onclick:function(){if(kind==="approve"&&!confirm("Approve "+t.identifier+" and mark it done?"))return;api("/m/task/"+id+"/"+kind,{note:note.value}).then(home).catch(function(e){alert(e.message)})}}));}
if(t.status==="in_review"){act("approve","✔ Approve","good");act("send-back","↩ Send back");}else act("comment","💬 Comment");
kids.push(row);main.replaceChildren.apply(main,kids);window.scrollTo(0,0);}).catch(fail);}
document.getElementById("refresh").onclick=home;
if(!token)fail(new Error("Open the phone link from the office's Building status once to connect this phone."));else home();
})();`;
