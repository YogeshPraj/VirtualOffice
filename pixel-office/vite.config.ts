import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { brainBridge } from "./brain-bridge";
import { recoveryBlockers } from "./recovery-blockers";
import { intakeBridge } from "./intake-bridge";
import { statusBridge } from "./status-bridge";

// Paperclip runs on 127.0.0.1:3100 in local_trusted mode. Proxying /api keeps the
// pixel office same-origin, so REST calls and the live-events WebSocket need no auth.
const PAPERCLIP = "http://127.0.0.1:3100";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Paperclip only knows AI sign-ins for a few vendors and re-applies an employee's existing one
 * on every update, so an employee can never be moved to a provider without one (e.g. Copilot)
 * through its API. This local-only endpoint detaches the sign-in from the Paperclip database
 * so the normal provider switch can then succeed.
 */
function detachAiConnection(): Plugin {
  const instanceDir = process.env.PAPERCLIP_HOME
    ? path.join(process.env.PAPERCLIP_HOME, "instances", "default")
    : path.resolve(__dirname, "..", ".paperclip", "instances", "default");
  const dbPort = (): number => {
    try {
      return JSON.parse(fs.readFileSync(path.join(instanceDir, "config.json"), "utf8")).database.embeddedPostgresPort;
    } catch {
      return 54329;
    }
  };
  return {
    name: "detach-ai-connection",
    configureServer(server) {
      server.middlewares.use("/office-admin/detach-ai-connection", (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { error: "POST only" });
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            const { agentId } = JSON.parse(raw || "{}");
            if (typeof agentId !== "string" || !UUID.test(agentId)) return reply(400, { error: "agentId must be a UUID" });
            const { default: pg } = await import("pg");
            const client = new pg.Client({
              connectionString: process.env.PAPERCLIP_DB_URL ?? `postgres://paperclip:paperclip@127.0.0.1:${dbPort()}/paperclip`,
            });
            await client.connect();
            try {
              const r = await client.query("update agents set runtime_config = runtime_config - 'aiConnection' where id = $1", [agentId]);
              reply(200, { detached: r.rowCount });
            } finally {
              await client.end();
            }
          } catch (e) {
            reply(500, { error: e instanceof Error ? e.message : String(e) });
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), detachAiConnection(), brainBridge(), recoveryBlockers(), intakeBridge(), statusBridge()],
  server: {
    port: 5180,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": { target: PAPERCLIP, changeOrigin: true, ws: true },
    },
  },
});
