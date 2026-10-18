import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ActivityEntry, Agent, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";

export interface HistoryLine {
  at: string;
  icon: string;
  text: string;
  /** Lines with the same group key close together fold into one. */
  group?: string;
  count?: number;
  /** How to say it when several fold together; {n} is the count. */
  plural?: string;
}

const fmtMin = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.max(1, Math.round(ms / 60_000))} min`);
const ACTION_WORDS = (a: string) => a.replace(/^issue\./, "").replace(/_/g, " ");

/** Markdown snippet → plain text for a one-line summary. */
export const plain = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Turn one activity entry into a readable line. */
export function describe(a: ActivityEntry, name: (agentId: string | null) => string): HistoryLine {
  const who = a.actorType === "agent" ? name(a.actorId) : a.actorType === "user" ? "You" : "Paperclip";
  const d = (a.details ?? {}) as Record<string, unknown>;
  const changes = (d.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
  switch (a.action) {
    case "issue.created":
      return { at: a.createdAt, icon: "📌", text: `${who} created the task` };
    case "issue.updated": {
      const parts: string[] = [];
      if (changes.status) parts.push(`moved it ${String(changes.status.from ?? "?").replace("_", " ")} → ${String(changes.status.to).replace("_", " ")}`);
      if (changes.assigneeAgentId) parts.push(changes.assigneeAgentId.to ? `assigned it to ${name(String(changes.assigneeAgentId.to))}` : "unassigned it");
      if (changes.priority) parts.push(`set priority ${String(changes.priority.to)}`);
      if (changes.title) parts.push("renamed it");
      if (changes.parentId) parts.push(changes.parentId.to ? "moved it under another task" : "made it top-level");
      if (changes.projectId) parts.push("changed its project");
      if (changes.description) parts.push("edited the details");
      if (!parts.length) return { at: a.createdAt, icon: "✏️", text: `${who} updated the task`, group: `upd:${who}` };
      const icon = changes.status?.to === "done" ? "✅" : changes.status?.to === "blocked" ? "⛔" : changes.status ? "➡" : changes.assigneeAgentId ? "🙋" : "✏️";
      return { at: a.createdAt, icon, text: `${who} ${parts.join(", ")}` };
    }
    case "issue.comment_added":
      return { at: a.createdAt, icon: "💬", text: `${who}: ${plain(String(d.bodySnippet ?? "commented")).slice(0, 140)}` };
    case "issue.document_created":
      return { at: a.createdAt, icon: "📄", text: `${who} wrote the ${String(d.key ?? d.title ?? "")} document`.replace("the  document", "a document") };
    case "issue.document_updated":
      return { at: a.createdAt, icon: "📄", text: `${who} revised the ${String(d.key ?? d.title ?? "")} document`.replace("the  document", "a document"), group: `doc:${who}:${String(d.key ?? "")}` };
    case "issue.work_product_created":
      return { at: a.createdAt, icon: "🛠", text: `${who} linked ${String(d.title ?? "a work product")}`, group: `wp:${who}`, plural: `${who} linked {n} work products` };
    case "issue.attachment_added":
      return { at: a.createdAt, icon: "📎", text: `${who} attached ${String(d.originalFilename ?? d.filename ?? "a file")}`, group: `att:${who}`, plural: `${who} attached {n} files` };
    case "issue.checked_out":
      return { at: a.createdAt, icon: "🙋", text: `${who} picked it up` };
    case "issue.thread_interaction_created":
      return { at: a.createdAt, icon: "❓", text: `${who} asked you something` };
    case "issue.connection_intent_connected":
      return { at: a.createdAt, icon: "🔌", text: `${who} connected the sign-in it needed` };
    case "issue.blockers_updated":
      return { at: a.createdAt, icon: "⛓", text: `${who} changed what it waits on` };
    case "issue.blockers_resolved_wake_emitted":
      return { at: a.createdAt, icon: "🔓", text: "Everything it waited on finished; work resumed" };
    default:
      return { at: a.createdAt, icon: "·", text: `${who}: ${ACTION_WORDS(a.action)}`, group: `misc:${a.action}` };
  }
}

/** Fold runs of the same kind of event within 10 minutes ("attached 6 files"). */
export function fold(lines: HistoryLine[]): HistoryLine[] {
  const out: HistoryLine[] = [];
  for (const l of lines) {
    // Look a few lines back, so interleaved bursts (attach, link, attach, link…) still fold.
    const prev = l.group ? out.slice(-4).reverse().find((p) => p.group === l.group && Math.abs(Date.parse(l.at) - Date.parse(p.at)) < 10 * 60_000) : undefined;
    if (prev) {
      prev.count = (prev.count ?? 1) + 1;
      continue;
    }
    out.push({ ...l });
  }
  return out;
}

/** Everything that happened to a task, oldest first. */
export function TaskHistory({ issue }: { issue: Issue }) {
  const { agentById } = useOfficeData();
  const [shown, setShown] = useState(false);
  const activity = useQuery({ queryKey: ["issue-activity", issue.id, issue.updatedAt], queryFn: () => api.issueActivity(issue.id), enabled: shown });
  const runs = useQuery({ queryKey: ["issue-runs", issue.id, issue.updatedAt], queryFn: () => api.issueRuns(issue.id), enabled: shown });
  const name = (id: string | null) => (agentById(id) as Agent | undefined)?.name ?? "someone";

  const lines: HistoryLine[] = [
    ...(activity.data ?? []).map((a) => describe(a, name)),
    ...(runs.data ?? []).flatMap((r) => {
      const who = name(r.agentId);
      const out: HistoryLine[] = [];
      if (r.startedAt) out.push({ at: r.startedAt, icon: "▶", text: `${who} started a shift` });
      if (r.finishedAt) {
        const len = r.startedAt ? ` after ${fmtMin(Date.parse(r.finishedAt) - Date.parse(r.startedAt))}` : "";
        const ok = r.status === "succeeded";
        out.push({ at: r.finishedAt, icon: ok ? "■" : "⚠", text: `${who}'s shift ${ok ? "ended" : r.status.replace("_", " ")}${len}${!ok && r.errorCode ? ` (${r.errorCode})` : ""}` });
      }
      return out;
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const folded = fold(lines);

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🕘 HISTORY</h4>
        <button className="px-btn small" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {shown && (
        <div className="history">
          {(activity.isLoading || runs.isLoading) && <div className="muted">Reading the logbook…</div>}
          {folded.map((l, i) => {
            const day = new Date(l.at).toDateString();
            const newDay = i === 0 || new Date(folded[i - 1].at).toDateString() !== day;
            return (
              <div key={i}>
                {newDay && <div className="history-day">{new Date(l.at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</div>}
                <div className="history-line">
                  <span className="muted">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{l.icon}</span>
                  <span style={{ flex: 1 }}>
                    {l.count && l.count > 1 && l.plural ? l.plural.replace("{n}", String(l.count)) : l.text}
                    {l.count && l.count > 1 && !l.plural ? <span className="muted"> (×{l.count})</span> : null}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
