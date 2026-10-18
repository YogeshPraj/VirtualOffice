import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { errorHint } from "./AgentRepair";

const FAILED = new Set(["failed", "timed_out"]);
/** Failures that aren't the employee's fault and that other cards already explain. */
const BENIGN = /blocked by unresolved blockers/i;

/** Plain words for Paperclip's stop codes when the run left no error text. */
const CODE_HINT: Record<string, string> = {
  adapter_failed: "Their program (Claude Code or Copilot) exited with an error. Look at their screen for the last lines it printed.",
  configuration_incomplete: "Their setup is incomplete (missing model, folder or sign-in). Open their desk and use the repair kit.",
  setup_failed: "The shift couldn't start. Check Building status for anything red.",
  process_lost: "The program stopped unexpectedly (the PC may have slept or restarted). Usually trying again is enough.",
  timeout: "The shift ran out of time. Try again, or split the task into smaller pieces.",
  timed_out: "The shift ran out of time. Try again, or split the task into smaller pieces.",
  cancelled: "Someone stopped the shift.",
};

/** When the latest shift on a task failed: say why, and offer a one-click retry. */
export function LastShift({ issue }: { issue: Issue }) {
  const { company, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const active = issue.status !== "done" && issue.status !== "cancelled";
  const { data: runs } = useQuery({
    queryKey: ["issue-runs", issue.id, issue.updatedAt],
    queryFn: () => api.issueRuns(issue.id),
    enabled: active,
    refetchInterval: 60_000,
  });
  const retry = useMutation({
    mutationFn: (agentId: string) => api.wakeOnIssue(agentId, issue.id, "The CEO asked for another try after a failed shift"),
    onSuccess: () => {
      toast("Sent them back to it.");
      qc.invalidateQueries({ queryKey: ["issue-runs", issue.id] });
      qc.invalidateQueries({ queryKey: keys.agents(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  const last = runs?.[0];
  if (!active || !last || !FAILED.has(last.status) || BENIGN.test(last.error ?? "")) return null;
  const who = agentById(last.agentId) ?? agentById(issue.assigneeAgentId);
  const retryTo = issue.assigneeAgentId ?? last.agentId;
  const hint = errorHint(last.error) ?? (last.errorCode ? CODE_HINT[last.errorCode] : undefined) ?? (last.status === "timed_out" ? CODE_HINT.timed_out : undefined);
  const scheduled = last.scheduledRetryAt && Date.parse(last.scheduledRetryAt) > Date.now();
  const busy = !!runs?.some((r) => r.status === "running" || r.status === "queued");

  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--bad)" }}>
      <h4>⚠ LAST SHIFT {last.status === "timed_out" ? "TIMED OUT" : "FAILED"}</h4>
      <div style={{ fontSize: 17 }}>
        {who?.name ?? "Someone"}'s shift{last.finishedAt ? ` at ${new Date(last.finishedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : ""} ended with
        {last.errorCode ? <code> {last.errorCode}</code> : " an error"}.
      </div>
      {last.error && <pre className="fail-detail">{last.error.slice(0, 600)}</pre>}
      {hint && <div style={{ fontSize: 16 }}>💡 {hint}</div>}
      {scheduled && <div className="muted" style={{ fontSize: 16 }}>Paperclip will retry by itself at {new Date(last.scheduledRetryAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</div>}
      <div className="row">
        <button className="px-btn small primary" disabled={!retryTo || retry.isPending || busy} onClick={() => retryTo && retry.mutate(retryTo)}>
          {busy ? "Already working on it" : retry.isPending ? "Sending…" : "↻ Try again"}
        </button>
        {who && (
          <button className="px-btn small" onClick={() => open({ kind: "agent", agentId: who.id })}>
            👀 See their screen
          </button>
        )}
      </div>
    </div>
  );
}
