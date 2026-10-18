// Read-only lookup of recovery records that silently block a task.
//
// Paperclip keeps a task un-wakeable while any recovery record for it is still "active" or has
// its automatic replay blocked, even after that record is "resolved" (same predicate as
// executionBlockerPredicate() in Paperclip's server). Records in the second state appear in
// neither the attention feed nor GET /issues/:id/recovery-actions, so the CEO would see a
// stuck task with nothing to click. This endpoint lists them so the pixel office can ask the
// CEO what the interrupted run did and resolve them through Paperclip's own API.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors EXECUTION_RECONCILIATION_CAUSES in @paperclipai/shared.
const CAUSES = [
  "uncertain_provider_action", "uncertain_external_action", "uncertain_control_plane_action",
  "completed_action_context_missing", "continuation_evidence_incomplete",
  "execution_finalization_deadline_exceeded", "execution_recovery_budget_exhausted",
  "provider_effect_inventory_unavailable", "provider_failure_meaning_unverified",
  "provider_ownership_unverified", "native_provider_terminal_failed", "native_event_replay_conflict",
  "native_session_cleanup_quarantined", "native_session_retry_exhausted",
  "native_restart_recovery_blocked", "native_continuation_requires_reconciliation",
  "legacy_execution_requires_reconciliation",
];

export function recoveryBlockers(): Plugin {
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
    name: "recovery-blockers",
    configureServer(server) {
      server.middlewares.use("/office-admin/recovery-blockers", async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const issueId = new URL(req.url ?? "/", "http://local").searchParams.get("issueId") ?? "";
        if (req.method !== "GET") return reply(405, { error: "GET only" });
        if (!UUID.test(issueId)) return reply(400, { error: "issueId must be a UUID" });
        try {
          const { default: pg } = await import("pg");
          const client = new pg.Client({
            connectionString: process.env.PAPERCLIP_DB_URL ?? `postgres://paperclip:paperclip@127.0.0.1:${dbPort()}/paperclip`,
          });
          await client.connect();
          try {
            const r = await client.query(
              `select a.id, a.status, a.cause, a.next_action, a.created_at,
                      coalesce(a.evidence->>'runId', a.evidence->>'sourceRunId') as run_id,
                      run.agent_id as run_agent_id, run.error as run_error, run.status as run_status,
                      run.started_at as run_started_at, run.finished_at as run_finished_at
                 from issue_recovery_actions a
                 left join heartbeat_runs run on run.id::text = coalesce(a.evidence->>'runId', a.evidence->>'sourceRunId')
                where a.source_issue_id = $1
                  and a.cause = any($2)
                  and (a.status in ('active', 'escalated') or a.evidence->'automaticRecovery'->>'replay' = 'blocked')
                order by a.updated_at desc`,
              [issueId, CAUSES],
            );
            reply(200, {
              blockers: r.rows.map((row) => ({
                id: row.id,
                status: row.status,
                cause: row.cause,
                nextAction: row.next_action,
                createdAt: row.created_at,
                runId: row.run_id,
                run: row.run_id
                  ? { agentId: row.run_agent_id, status: row.run_status, error: row.run_error, startedAt: row.run_started_at, finishedAt: row.run_finished_at }
                  : null,
              })),
            });
          } finally {
            await client.end();
          }
        } catch (e) {
          reply(500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
