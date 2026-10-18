// Intake desk bridge: turns pasted links into task-ready summaries, server-side.
//
//   Azure DevOps work items -> `az boards work-item show` (the CEO's own az / Entra sign-in)
//   GitHub issues and PRs   -> `gh issue view` / `gh pr view` (the CEO's gh sign-in)
//   anything else           -> a plain link
//
// Commands run with execFile (no shell), so pasted text can never become a command.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export interface IntakeItem {
  url: string;
  source: "ado" | "github" | "link";
  key: string; // e.g. "ADO 1234", "org/repo#12"
  title: string;
  type?: string;
  state?: string;
  body?: string; // markdown-ish text for the task description
  fields?: Record<string, string>;
  error?: string; // could not fetch details; the task still gets the link
  fix?: string; // how to make fetching work next time
}

// dev.azure.com/{org}/{project}/_workitems/edit/{id}  and  {org}.visualstudio.com/{project}/_workitems/edit/{id}
const ADO_PATTERNS = [
  /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/i,
  /^https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_workitems\/edit\/(\d+)/i,
];
const GITHUB_PATTERN = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/i;

export function parseLink(raw: string): { source: IntakeItem["source"]; url: string; org?: string; project?: string; id?: string; repo?: string; kind?: string } | null {
  const url = raw.trim().replace(/[)>.,;]+$/, "");
  if (!/^https?:\/\//i.test(url)) return null;
  for (const p of ADO_PATTERNS) {
    const m = url.match(p);
    if (m) return { source: "ado", url, org: decodeURIComponent(m[1]), project: decodeURIComponent(m[2]), id: m[3] };
  }
  const g = url.match(GITHUB_PATTERN);
  if (g) return { source: "github", url, repo: `${g[1]}/${g[2]}`, kind: g[3].toLowerCase(), id: g[4] };
  return { source: "link", url };
}

function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ ok: boolean; stdout: string; stderr: string; missing: boolean }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: false }, (err, stdout, stderr) => {
      const missing = !!err && ((err as NodeJS.ErrnoException).code === "ENOENT");
      resolve({ ok: !err, stdout: String(stdout ?? ""), stderr: String(stderr ?? (err ? err.message : "")), missing });
    });
  });
}

// Node refuses to run .cmd files (az.cmd) without a shell on Windows, and a shell would let
// pasted text become a command. az.cmd is a thin wrapper around its bundled Python, so call
// that directly: `python.exe -IBm azure.cli <args>`, exactly what az.cmd does.
function azCommand(): { cmd: string; prefix: string[] } {
  if (process.platform !== "win32") return { cmd: "az", prefix: [] };
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs")];
  for (const root of roots) {
    if (!root) continue;
    const py = join(root, "Microsoft SDKs", "Azure", "CLI2", "python.exe");
    if (existsSync(py)) return { cmd: py, prefix: ["-IBm", "azure.cli"] };
  }
  return { cmd: "az-not-installed", prefix: [] }; // ENOENT -> reported as "install the Azure CLI"
}

// Org and project come from the pasted URL; only accept plain names.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

/** ADO stores rich text as HTML; agents read plain text/markdown better. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveAdo(p: NonNullable<ReturnType<typeof parseLink>>): Promise<IntakeItem> {
  const base: IntakeItem = { url: p.url, source: "ado", key: `ADO ${p.id}`, title: `Work item ${p.id}` };
  if (!SAFE_NAME.test(p.org ?? "")) return { ...base, error: "That doesn't look like an Azure DevOps organization name." };
  const org = p.url.includes("visualstudio.com") ? `https://${p.org}.visualstudio.com` : `https://dev.azure.com/${p.org}`;
  const az = azCommand();
  const r = await run(az.cmd, [...az.prefix, "boards", "work-item", "show", "--id", p.id!, "--org", org, "--output", "json"]);
  if (r.missing) {
    return {
      ...base,
      error: "Azure CLI isn't installed, so only the link was captured.",
      fix: "winget install Microsoft.AzureCLI, then: az extension add --name azure-devops, then: az login",
    };
  }
  if (!r.ok) {
    const text = r.stderr.trim();
    const login = /az login|not logged in|authenticat|AADSTS|credential/i.test(text);
    const ext = /extension|'boards' is misspelled|not in the 'az' command group/i.test(text);
    return {
      ...base,
      error: text.split("\n").find(Boolean)?.slice(0, 240) ?? "az failed",
      fix: ext ? "az extension add --name azure-devops" : login ? "az login (sign in with your work account)" : undefined,
    };
  }
  const wi = JSON.parse(r.stdout) as { id: number; fields: Record<string, unknown> };
  const f = wi.fields ?? {};
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : typeof f[k] === "number" ? String(f[k]) : "");
  const person = (k: string) => (f[k] && typeof f[k] === "object" ? String((f[k] as { displayName?: string }).displayName ?? "") : s(k));
  const sections: [string, string][] = [
    ["Description", htmlToText(s("System.Description"))],
    ["Acceptance criteria", htmlToText(s("Microsoft.VSTS.Common.AcceptanceCriteria"))],
    ["Repro steps", htmlToText(s("Microsoft.VSTS.TCM.ReproSteps"))],
    ["System info", htmlToText(s("Microsoft.VSTS.TCM.SystemInfo"))],
  ];
  const fields: Record<string, string> = {};
  for (const [label, key] of [
    ["Type", "System.WorkItemType"],
    ["State", "System.State"],
    ["Area", "System.AreaPath"],
    ["Iteration", "System.IterationPath"],
    ["Priority", "Microsoft.VSTS.Common.Priority"],
    ["Severity", "Microsoft.VSTS.Common.Severity"],
    ["Tags", "System.Tags"],
  ] as const) {
    if (s(key)) fields[label] = s(key);
  }
  if (person("System.AssignedTo")) fields["Assigned to (ADO)"] = person("System.AssignedTo");
  return {
    ...base,
    title: s("System.Title") || base.title,
    type: s("System.WorkItemType") || undefined,
    state: s("System.State") || undefined,
    fields,
    body: sections.filter(([, v]) => v).map(([k, v]) => `### ${k}\n${v}`).join("\n\n"),
  };
}

async function resolveGithub(p: NonNullable<ReturnType<typeof parseLink>>): Promise<IntakeItem> {
  const isPr = p.kind === "pull";
  const base: IntakeItem = { url: p.url, source: "github", key: `${p.repo}#${p.id}`, title: `${isPr ? "PR" : "Issue"} ${p.repo}#${p.id}` };
  const jsonFields = isPr ? "title,body,state,labels,headRefName,baseRefName,isDraft" : "title,body,state,labels";
  const r = await run("gh", [isPr ? "pr" : "issue", "view", p.id!, "-R", p.repo!, "--json", jsonFields]);
  if (r.missing) return { ...base, error: "GitHub CLI isn't installed, so only the link was captured.", fix: "winget install GitHub.cli, then: gh auth login" };
  if (!r.ok) {
    const text = r.stderr.trim();
    return { ...base, error: text.split("\n").find(Boolean)?.slice(0, 240) ?? "gh failed", fix: /auth|login|SAML|SSO/i.test(text) ? "gh auth login (and authorize SSO for the org if asked)" : undefined };
  }
  const d = JSON.parse(r.stdout) as { title: string; body?: string; state?: string; labels?: { name: string }[]; headRefName?: string; baseRefName?: string; isDraft?: boolean };
  const fields: Record<string, string> = { Type: isPr ? (d.isDraft ? "Draft PR" : "Pull request") : "Issue" };
  if (d.state) fields.State = d.state.toLowerCase();
  if (d.labels?.length) fields.Labels = d.labels.map((l) => l.name).join(", ");
  if (isPr && d.headRefName) fields.Branch = `${d.headRefName} -> ${d.baseRefName}`;
  return { ...base, title: d.title, type: fields.Type, state: fields.State, fields, body: d.body ? `### Description\n${d.body.trim()}` : "" };
}

export async function resolveLinks(lines: string[]): Promise<{ items: IntakeItem[]; ignored: string[] }> {
  const seen = new Set<string>();
  const parsed: NonNullable<ReturnType<typeof parseLink>>[] = [];
  const ignored: string[] = [];
  for (const line of lines) {
    for (const token of line.split(/\s+/).filter(Boolean)) {
      const p = parseLink(token);
      if (!p) {
        if (/^https?:/i.test(token)) ignored.push(token);
        continue;
      }
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      parsed.push(p);
    }
  }
  const items = await Promise.all(
    parsed.slice(0, 50).map((p) =>
      p.source === "ado"
        ? resolveAdo(p)
        : p.source === "github"
          ? resolveGithub(p)
          : Promise.resolve<IntakeItem>({ url: p.url, source: "link", key: new URL(p.url).hostname, title: p.url }),
    ),
  );
  return { items, ignored };
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

export function intakeBridge(): Plugin {
  return {
    name: "intake-bridge",
    configureServer(server) {
      server.middlewares.use("/office-admin/intake/resolve", async (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        try {
          const body = await readBody(req);
          const text = String(body.text ?? "").slice(0, 20_000);
          send(res, 200, await resolveLinks(text.split(/\r?\n/)));
        } catch (e) {
          send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
