// Bring your company: on a fresh office (a new laptop, say), import the company from your private
// company repo's `company/paperclip-export/` (made by scripts/export-company.ps1). Preview first,
// then apply. Secrets were never exported, so they're entered again in the vault.
//
//   GET  /office-admin/company-import          -> is there an export to bring in?
//   POST /office-admin/company-import/preview  { name? } -> what would come in
//   POST /office-admin/company-import/apply    { name? } -> creates the company

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const PAPERCLIP = "http://127.0.0.1:3100/api";
export const EXPORT_DIR = resolve(__dirname, "..", "company", "paperclip-export");
const MAX_BYTES = 20 * 1024 * 1024;

const BINARY: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

export type ExportFile = string | { encoding: "base64"; data: string; contentType: string };

/** Every file in the export, keyed by its path with forward slashes; images as base64. */
export function collectExport(dir = EXPORT_DIR): Record<string, ExportFile> {
  const files: Record<string, ExportFile> = {};
  let bytes = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      bytes += statSync(p).size;
      if (bytes > MAX_BYTES) throw new Error("The export is bigger than 20 MB; import it with the paperclipai CLI instead.");
      const key = relative(dir, p).split(sep).join("/");
      const type = BINARY[extname(e.name).toLowerCase()];
      files[key] = type ? { encoding: "base64", data: readFileSync(p).toString("base64"), contentType: type } : readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return files;
}

/** The import request: company, employees, projects and skills (not tasks) into a new company. */
export function importBody(files: Record<string, ExportFile>, name?: string | null) {
  return {
    source: { type: "inline" as const, files, expectedFileCount: Object.keys(files).length },
    include: { company: true, agents: true, projects: true, skills: true, issues: false },
    target: { mode: "new_company" as const, newCompanyName: name?.trim() || null },
    agents: "all" as const,
    collisionStrategy: "rename" as const,
  };
}

async function readJson(req: IncomingMessage): Promise<{ name?: string }> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function companyImport(): Plugin {
  return {
    name: "pixel-office-company-import",
    configureServer(server) {
      server.middlewares.use("/office-admin/company-import", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.end(JSON.stringify(body));
        };
        const available = existsSync(join(EXPORT_DIR, "COMPANY.md"));
        if (req.method === "GET") return send(200, { available, path: "company/paperclip-export" });
        const step = (req.url ?? "").replace(/^\//, "").split("?")[0];
        if (req.method !== "POST" || (step !== "preview" && step !== "apply")) return send(405, { error: "GET, or POST /preview or /apply" });
        if (!available) return send(404, { error: "No export found in company/paperclip-export. Clone your private company repo into company/ first." });
        try {
          const { name } = await readJson(req);
          const body = importBody(collectExport(), name);
          const r = await fetch(`${PAPERCLIP}/companies/import${step === "preview" ? "/preview" : ""}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000),
          });
          const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          send(r.ok ? 200 : r.status, data);
        } catch (e) {
          send(500, { error: (e as Error).message });
        }
      });
    },
  };
}
