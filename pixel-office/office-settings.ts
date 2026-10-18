// Small office-wide settings shared by every browser, kept on the office server in ../.office/
// (git-ignored, so they never reach the public repo).
//
//   GET /office-admin/settings/<name>      -> the stored JSON (or null)
//   PUT /office-admin/settings/<name>      -> store it
//
// Only the names listed here can be read or written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const DIR = resolve(__dirname, "..", ".office");
// name -> largest accepted body
const ALLOWED = new Map<string, number>([
  ["templates", 256 * 1024],
  ["instructions-history", 4 * 1024 * 1024],
]);

async function readBody(req: IncomingMessage, max: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new Error("Too big.");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function officeSettings(): Plugin {
  return {
    name: "pixel-office-settings",
    configureServer(server) {
      server.middlewares.use("/office-admin/settings", async (req, res) => {
        res.setHeader("content-type", "application/json");
        const name = (req.url ?? "").replace(/^\/+|\?.*$/g, "");
        if (!ALLOWED.has(name)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: "Unknown setting." }));
        }
        const file = join(DIR, `${name}.json`);
        try {
          if (req.method === "GET") return res.end(existsSync(file) ? readFileSync(file, "utf8") : "null");
          if (req.method === "PUT") {
            const text = await readBody(req, ALLOWED.get(name)!);
            JSON.parse(text); // must be valid JSON
            if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
            writeFileSync(file, text);
            return res.end(text);
          }
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "GET or PUT" }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
