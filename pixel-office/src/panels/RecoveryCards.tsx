import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AttentionItem, RecoveryAction } from "../api/types";
import { logDecision } from "../api/brain";
import { useOfficeData } from "../state/officeData";
import { CLASSIC_UI } from "../ui/Window";

/** Causes where Paperclip refuses a plain retry: someone must say what the stopped run already did.
 *  Mirrors EXECUTION_RECONCILIATION_CAUSES in @paperclipai/shared. */
const NEEDS_RECONCILIATION = new Set([
  "uncertain_provider_action",
  "uncertain_external_action",
  "uncertain_control_plane_action",
  "completed_action_context_missing",
  "continuation_evidence_incomplete",
  "execution_finalization_deadline_exceeded",
  "execution_recovery_budget_exhausted",
  "provider_effect_inventory_unavailable",
  "provider_failure_meaning_unverified",
  "provider_ownership_unverified",
  "native_provider_terminal_failed",
  "native_event_replay_conflict",
  "native_session_cleanup_quarantined",
  "native_session_retry_exhausted",
  "native_restart_recovery_blocked",
  "native_continuation_requires_reconciliation",
  "legacy_execution_requires_reconciliation",
]);

const OUTCOMES: { id: "completed" | "not_performed" | "mixed"; label: string; help: string }[] = [
  { id: "not_performed", label: "Nothing happened", help: "Its actions didn't take effect. Safe to redo from the start." },
  { id: "completed", label: "It finished its actions", help: "Comments/tasks/changes are there; only the wrap-up was lost." },
  { id: "mixed", label: "Partly", help: "Some actions happened, some didn't. Say which in your note." },
];

const humanize = (s: string) => s.replace(/_/g, " ");

/** "Blocks 0 tasks and needs human attention": every blocker is done, but the task stayed blocked. */
export function StaleBlockerCard({ item }: { item: AttentionItem }) {
  const { company, agentById, toast } = useOfficeData();
  const qc = useQueryClient();
  const issueId = item.relatedIssue?.id ?? item.subject.id;
  const ownerId = item.subject.metadata?.assigneeAgentId as string | undefined;
  const owner = agentById(ownerId);
  const blockers = useQuery({ queryKey: ["blockers", issueId], queryFn: () => api.issueBlockers(issueId) });
  const hidden = useQuery({ queryKey: ["hidden-recovery", issueId], queryFn: () => fetchHiddenBlockers(issueId) });
  const refresh = () => {
    qc.invalidateQueries();
  };

  const unblock = useMutation({
    mutationFn: async () => {
      await api.updateIssue(issueId, { status: "todo" });
      const wake = ownerId
        ? ((await api.wakeOnIssue(ownerId, issueId, "ceo_unblocked_stale_blocker")) as { status?: string; reason?: string })
        : null;
      if (wake?.status === "skipped") {
        hidden.refetch();
        throw new Error(
          wake.reason === "execution_reconciliation_required"
            ? "An interrupted run still holds this task. Answer the questions below, then it can continue."
            : `Paperclip didn't wake ${owner?.name ?? "the owner"} (${wake.reason ?? "skipped"}).`,
        );
      }
    },
    onSuccess: () => {
      toast(owner ? `Unblocked. ${owner.name} is picking it up.` : "Unblocked.");
      logDecision(`CEO unblocked ${item.subject.identifier ?? "a task"} (all its blockers were done).`, item.subject.identifier ?? company.name, "CEO office");
      refresh();
    },
  });
  const nudge = useMutation({
    mutationFn: () => api.wakeOnIssue(ownerId!, issueId, "ceo_nudge"),
    onSuccess: () => {
      toast(`Tapped ${owner?.name ?? "the owner"} on the shoulder.`);
      refresh();
    },
  });

  const waiting = blockers.data?.blockers.filter((b) => b.status !== "done" && b.status !== "cancelled") ?? [];
  const busy = unblock.isPending || nudge.isPending;
  return (
    <div className="rpg-box">
      <div className="speaker">{item.subject.identifier} is stuck</div>
      <div style={{ marginBottom: 8 }}>
        {blockers.data?.diagnosis ?? "It is marked blocked but nothing is actively working on it."}
      </div>
      {blockers.data && waiting.length === 0 && blockers.data.blockers.length > 0 && (
        <div style={{ color: "#cfcfe0", fontSize: 18, marginBottom: 8 }}>
          Everything it waited on is done: {blockers.data.blockers.map((b) => b.identifier).join(", ")}.
        </div>
      )}
      <div className="row">
        <button className="px-btn good" disabled={busy || waiting.length > 0} onClick={() => unblock.mutate()}>
          ▶ Unblock{owner ? ` & wake ${owner.name}` : ""}
        </button>
        {ownerId && (
          <button className="px-btn small" disabled={busy} onClick={() => nudge.mutate()}>
            👋 Nudge {owner?.name ?? "owner"}
          </button>
        )}
      </div>
      {waiting.length > 0 && (
        <div style={{ color: "#cfcfe0", fontSize: 17, marginTop: 6 }}>
          Still waiting on {waiting.map((b) => b.identifier).join(", ")}, so it's not stale yet.
        </div>
      )}
      {(hidden.data?.length ?? 0) > 0 && (
        <HiddenRecoveryForm
          issueId={issueId}
          blockers={hidden.data!}
          ownerId={ownerId}
          onDone={() => {
            toast(owner ? `Cleared. ${owner.name} is picking it up.` : "Cleared.");
            refresh();
          }}
        />
      )}
    </div>
  );
}

interface HiddenBlocker {
  id: string;
  status: string;
  cause: string;
  nextAction: string;
  runId: string | null;
  run: { agentId: string | null; status: string | null; error: string | null; startedAt: string | null; finishedAt: string | null } | null;
}

async function fetchHiddenBlockers(issueId: string): Promise<HiddenBlocker[]> {
  const res = await fetch(`/office-admin/recovery-blockers?issueId=${issueId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Couldn't read recovery records");
  return (data as { blockers: HiddenBlocker[] }).blockers;
}

/** A run that failed while starting ("spawn ...") can't have done anything. */
function neverStarted(b: HiddenBlocker): boolean {
  const err = b.run?.error ?? "";
  const start = b.run?.startedAt ? new Date(b.run.startedAt).getTime() : NaN;
  const end = b.run?.finishedAt ? new Date(b.run.finishedAt).getTime() : NaN;
  return /^spawn |ENOENT|ENAMETOOLONG|EACCES/.test(err) && !(end - start > 60_000);
}

/** Resolves every hidden record for each interrupted run, after the CEO says what that run did. */
function HiddenRecoveryForm({
  issueId,
  blockers,
  ownerId,
  onDone,
}: {
  issueId: string;
  blockers: HiddenBlocker[];
  ownerId?: string;
  onDone: () => void;
}) {
  const { agentById, company } = useOfficeData();
  const runs = [...new Map(blockers.map((b) => [b.runId ?? b.id, b])).values()];
  const first = runs[0];
  const autoNothing = runs.every(neverStarted);
  const [outcome, setOutcome] = useState<"completed" | "not_performed" | "mixed" | null>(autoNothing ? "not_performed" : null);
  const [stopped, setStopped] = useState(autoNothing);
  const [note, setNote] = useState(
    autoNothing
      ? `The run failed while starting (${first.run?.error ?? "spawn error"}); the provider process was never created, so nothing was done.`
      : "",
  );
  const who = agentById(first.run?.agentId ?? ownerId)?.name ?? "The employee";

  const clear = useMutation({
    mutationFn: async () => {
      for (const b of blockers) {
        if (!b.runId || !outcome) continue;
        await api.resolveRecovery(issueId, {
          actionId: b.id,
          outcome: "restored",
          sourceIssueStatus: "todo",
          resolutionNote: note.trim(),
          executionReconciliation: { runId: b.runId, providerStopped: true, actionOutcome: outcome, outcomeEvidence: note.trim() },
        });
      }
      if (ownerId) await api.wakeOnIssue(ownerId, issueId, "ceo_reconciled_interrupted_run");
    },
    onSuccess: () => {
      logDecision(
        `CEO reconciled ${runs.length} interrupted run(s) (${humanize(outcome ?? "unknown")}). Note: ${note.trim()}`,
        company.name,
        "CEO office, recovery",
      );
      onDone();
    },
  });
  const ready = !!outcome && stopped && note.trim().length >= 20 && runs.every((r) => r.runId);

  return (
    <div style={{ marginTop: 10, borderTop: "2px dashed #555", paddingTop: 8 }}>
      <div style={{ marginBottom: 6 }}>
        ⚠ {who}'s interrupted run{runs.length > 1 ? `s (${runs.length})` : ""} still {runs.length > 1 ? "hold" : "holds"} this task.
        Paperclip won't redo unverified work on its own, so tell it what happened:
      </div>
      {runs.map((r) => (
        <div key={r.id} style={{ color: "#cfcfe0", fontSize: 16, marginBottom: 4 }}>
          Run {r.runId?.slice(0, 8) ?? "?"}: {r.run?.status ?? "unknown"}
          {r.run?.error ? `, "${r.run.error.slice(0, 80)}"` : ""}
          {r.runId && r.run?.agentId && (
            <>
              {" · "}
              <a
                href={`${CLASSIC_UI}/${company.issuePrefix}/agents/${r.run.agentId}/runs/${r.runId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)" }}
              >
                log ↗
              </a>
            </>
          )}
        </div>
      ))}
      {autoNothing && (
        <div style={{ fontSize: 17, margin: "4px 0" }}>💡 It failed while starting, so it can't have done anything. The answers are pre-filled.</div>
      )}
      {OUTCOMES.map((o) => (
        <label key={o.id} className={`rpg-option ${outcome === o.id ? "selected" : ""}`} style={{ display: "flex", gap: 8, cursor: "pointer" }}>
          <input type="radio" checked={outcome === o.id} onChange={() => setOutcome(o.id)} style={{ marginTop: 6 }} />
          <span>
            {o.label}
            <small>{o.help}</small>
          </span>
        </label>
      ))}
      <label className="row" style={{ margin: "6px 0" }}>
        <input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)} />
        The interrupted run isn't still running.
      </label>
      <textarea
        className="px-textarea"
        style={{ color: "#1e1a24", minHeight: 60 }}
        aria-label="How you checked"
        placeholder="How did you check? (20+ characters)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="px-btn good" disabled={!ready || clear.isPending} onClick={() => clear.mutate()}>
        {clear.isPending ? "Clearing…" : "↻ Clear and continue"}
      </button>
    </div>
  );
}

/** A run was interrupted and Paperclip wants a human to decide what happens next. */
export function RecoveryCard({ item }: { item: AttentionItem }) {
  const { company, agentById, toast } = useOfficeData();
  const qc = useQueryClient();
  const issueId = item.relatedIssue?.id ?? (item.subject.metadata?.issueId as string | undefined) ?? null;
  const actions = useQuery({
    queryKey: ["recovery", issueId],
    queryFn: () => api.recoveryActions(issueId!),
    enabled: !!issueId,
  });
  const action: RecoveryAction | undefined =
    actions.data?.find((a) => a.id === item.subject.id) ?? actions.data?.find((a) => a.status !== "resolved");

  if (!issueId) return <ClassicFallback item={item} />;
  if (actions.isLoading) return <div className="rpg-box">Reading the incident report…</div>;
  if (!action) {
    return (
      <div className="rpg-box">
        <div className="speaker">Recovery</div>
        This was settled already. Nothing to do.
      </div>
    );
  }
  return <RecoveryForm key={action.id} issueId={issueId} action={action} agentName={agentById(action.previousOwnerAgentId)?.name} companyPrefix={company.issuePrefix} onDone={(msg) => { toast(msg); qc.invalidateQueries(); }} />;
}

function RecoveryForm({
  issueId,
  action,
  agentName,
  companyPrefix,
  onDone,
}: {
  issueId: string;
  action: RecoveryAction;
  agentName?: string;
  companyPrefix: string;
  onDone: (msg: string) => void;
}) {
  const { company } = useOfficeData();
  const reconcile = NEEDS_RECONCILIATION.has(action.cause);
  const runId = action.sourceRunId ?? (typeof action.evidence?.runId === "string" ? (action.evidence.runId as string) : null);
  const [outcome, setOutcome] = useState<"completed" | "not_performed" | "mixed" | null>(null);
  const [stopped, setStopped] = useState(false);
  const [note, setNote] = useState("");
  const who = agentName ?? "The employee";

  const resolve = useMutation({
    mutationFn: (choice: "retry" | "leave" | "done" | "false_alarm") => {
      const base = { actionId: action.id, resolutionNote: note.trim() || null };
      if (choice === "leave") return api.resolveRecovery(issueId, { ...base, outcome: "blocked", sourceIssueStatus: "blocked" });
      if (choice === "false_alarm") return api.resolveRecovery(issueId, { ...base, outcome: "false_positive", sourceIssueStatus: "in_review" });
      const status = choice === "done" ? "done" : "todo";
      return api.resolveRecovery(issueId, {
        ...base,
        outcome: "restored",
        sourceIssueStatus: status,
        ...(reconcile && runId && outcome
          ? { executionReconciliation: { runId, providerStopped: true as const, actionOutcome: outcome, outcomeEvidence: note.trim() } }
          : {}),
      });
    },
    onSuccess: (_d, choice) => {
      const said = { retry: "retry it", leave: "leave it stopped", done: "mark it done", false_alarm: "treat it as a false alarm" }[choice];
      logDecision(
        `CEO resolved an interrupted run (${humanize(action.cause)}) on a task: ${said}.` + (outcome ? ` Its actions: ${humanize(outcome)}.` : "") + (note.trim() ? ` Note: ${note.trim()}` : ""),
        company.name,
        "CEO office, recovery",
      );
      onDone(choice === "retry" ? `${who} will try again.` : "Recorded.");
    },
  });

  const canRetry = !reconcile || (!!runId && !!outcome && stopped && note.trim().length >= 20);
  const busy = resolve.isPending;
  const runLink = runId && action.previousOwnerAgentId ? `${CLASSIC_UI}/${companyPrefix}/agents/${action.previousOwnerAgentId}/runs/${runId}` : null;

  return (
    <div className="rpg-box">
      <div className="speaker">{who}'s run was interrupted</div>
      <div style={{ marginBottom: 6 }}>{action.nextAction || `Paperclip stopped and needs a decision (${humanize(action.cause)}).`}</div>
      <div style={{ color: "#cfcfe0", fontSize: 16, marginBottom: 8 }}>
        Cause: {humanize(action.cause)} · attempts {action.attemptCount}
        {runLink && (
          <>
            {" · "}
            <a href={runLink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              view the stopped run ↗
            </a>
          </>
        )}
      </div>

      {reconcile && (
        <>
          <div style={{ marginBottom: 6 }}>
            This runtime can't safely replay a half-finished run, so check the run log first: what did {who} already do?
          </div>
          {OUTCOMES.map((o) => (
            <label key={o.id} className={`rpg-option ${outcome === o.id ? "selected" : ""}`} style={{ display: "flex", gap: 8, cursor: "pointer" }}>
              <input type="radio" name={`outcome-${action.id}`} checked={outcome === o.id} onChange={() => setOutcome(o.id)} style={{ marginTop: 6 }} />
              <span>
                {o.label}
                <small>{o.help}</small>
              </span>
            </label>
          ))}
          <label className="row" style={{ margin: "6px 0" }}>
            <input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)} />
            The stopped run isn't still running (the log ends, or the agent shows idle).
          </label>
        </>
      )}
      <textarea
        className="px-textarea"
        style={{ color: "#1e1a24", minHeight: 60 }}
        aria-label="Your note"
        placeholder={reconcile ? "How did you check? e.g. 'Run log ends after posting the plan comment; no tasks were created.' (20+ characters)" : "Optional note"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row">
        <button className="px-btn good" disabled={busy || !canRetry} onClick={() => resolve.mutate("retry")} title={canRetry ? "" : "Answer the questions above first"}>
          ↻ Retry the work
        </button>
        <button className="px-btn small" disabled={busy} onClick={() => resolve.mutate("leave")}>
          ⏹ Leave it stopped
        </button>
        {!reconcile && (
          <>
            <button className="px-btn small" disabled={busy} onClick={() => resolve.mutate("done")}>✔ It's done</button>
            <button className="px-btn small" disabled={busy} onClick={() => resolve.mutate("false_alarm")}>False alarm</button>
          </>
        )}
      </div>
      {reconcile && !runId && (
        <div style={{ color: "#ffb0b0", fontSize: 16, marginTop: 6 }}>
          No run is attached to this incident, so a retry can't be reconciled here. Leave it stopped, or use the classic screen.
        </div>
      )}
    </div>
  );
}

function ClassicFallback({ item }: { item: AttentionItem }) {
  const { company } = useOfficeData();
  return (
    <div className="rpg-box">
      <div className="speaker">Needs a decision</div>
      <a className="px-btn primary small" href={`${CLASSIC_UI}${item.subject.href}`} target="_blank" rel="noreferrer">
        Decide on the classic screen ↗
      </a>
      <span className="muted" style={{ marginLeft: 8 }}>{company.issuePrefix}</span>
    </div>
  );
}
