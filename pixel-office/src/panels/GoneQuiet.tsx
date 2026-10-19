import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { isQuestion } from "./AskEmployee";

/** How long each status may sit without any activity before it counts as gone quiet. */
export const QUIET_AFTER_MS: Partial<Record<Issue["status"], number>> = {
  in_progress: 86_400_000,
  in_review: 86_400_000,
  blocked: 2 * 86_400_000,
  todo: 3 * 86_400_000,
};

export function goneQuiet(issues: Issue[], now = Date.now()) {
  return issues
    .filter((i) => !i.hiddenAt && !isQuestion(i) && QUIET_AFTER_MS[i.status] !== undefined)
    .map((i) => ({ issue: i, idleMs: now - Date.parse(i.lastActivityAt ?? i.updatedAt) }))
    .filter((x) => x.idleMs > QUIET_AFTER_MS[x.issue.status]!)
    .sort((a, b) => b.idleMs - a.idleMs);
}

const days = (ms: number) => {
  const d = ms / 86_400_000;
  return d < 2 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(d)} days`;
};

/** Tasks nobody has touched for too long, with the obvious next step. */
export function GoneQuiet() {
  const { issues, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const quiet = goneQuiet(issues);
  const nudge = useMutation({
    mutationFn: async (i: Issue) => {
      await api.addComment(i.id, "Checking in from the CEO: what's the status here, and is anything blocking you?");
      if (i.assigneeAgentId) await api.wakeOnIssue(i.assigneeAgentId, i.id, "The CEO asked for a status update on a quiet task");
    },
    onSuccess: (_d, i) => toast(`Nudged ${agentById(i.assigneeAgentId)?.name ?? "the team"} on ${i.identifier}.`),
    onError: (e: Error) => toast(e.message),
  });
  if (!quiet.length) return null;
  return (
    <div className="px-card" style={{ borderLeft: "8px solid #9aa7b4" }}>
      <h4>
        🕸 GONE QUIET <span className="muted">{quiet.length}</span>
      </h4>
      {quiet.slice(0, 8).map(({ issue: i, idleMs }) => {
        const who = agentById(i.assigneeAgentId);
        return (
          <div key={i.id} className="row" style={{ margin: "4px 0", alignItems: "flex-start" }}>
            <button className="link-btn" style={{ flex: 1, whiteSpace: "normal" }} onClick={() => open({ kind: "issue", issueId: i.id })}>
              {i.identifier} · {i.title}
              <small className="muted" style={{ display: "block", fontSize: 14 }}>
                {i.status.replace("_", " ")} · nothing for {days(idleMs)} · {who?.name ?? "unassigned"}
              </small>
            </button>
            {i.status === "in_review" ? (
              <button className="px-btn small" onClick={() => open({ kind: "room", room: "review" })}>Review</button>
            ) : who ? (
              <button className="px-btn small" disabled={nudge.isPending} onClick={() => nudge.mutate(i)} title={`Ask ${who.name} for a status update`}>
                👋 Nudge
              </button>
            ) : (
              <button className="px-btn small" onClick={() => open({ kind: "issue", issueId: i.id })}>Assign</button>
            )}
          </div>
        );
      })}
      {quiet.length > 8 && <div className="muted" style={{ fontSize: 14 }}>…and {quiet.length - 8} more.</div>}
    </div>
  );
}
