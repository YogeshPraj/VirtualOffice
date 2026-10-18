import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { IssueStatus } from "../api/types";
import { keys, useComments, useInteractions } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { ClassicLink } from "../ui/Window";
import { InteractionDialog } from "./InteractionDialog";
import { NOTE_COLORS } from "./MeetingPanel";

const STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

export function IssuePanel({ issueId }: { issueId: string }) {
  const { company, issues, agents, agentById, toast } = useOfficeData();
  const qc = useQueryClient();
  const cached = issues.find((i) => i.id === issueId);
  const { data: fetched } = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => api.issue(issueId),
    enabled: !cached,
  });
  const issue = cached ?? fetched;
  const comments = useComments(issueId);
  const interactions = useInteractions(issueId);
  const [draft, setDraft] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    qc.invalidateQueries({ queryKey: keys.comments(issueId) });
  };
  const update = useMutation({
    mutationFn: (body: Parameters<typeof api.updateIssue>[1]) => api.updateIssue(issueId, body),
    onSuccess: refresh,
    onError: (e: Error) => toast(e.message),
  });
  const comment = useMutation({
    mutationFn: () => api.addComment(issueId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!issue) return <div className="muted">Finding that sticky note…</div>;
  const pending = interactions.data?.filter((i) => i.status === "pending") ?? [];

  return (
    <>
      <div className="px-card" style={{ background: NOTE_COLORS[issue.status as IssueStatus] }}>
        <h4>{issue.identifier}</h4>
        <div style={{ fontSize: 22 }}>{issue.title}</div>
        {issue.description && <p style={{ whiteSpace: "pre-wrap", fontSize: 18 }}>{issue.description}</p>}
        <div className="row">
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Status" value={issue.status} onChange={(e) => update.mutate({ status: e.target.value as IssueStatus })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select
            className="px-select"
            style={{ width: "auto", margin: 0 }}
            aria-label="Assignee"
            value={issue.assigneeAgentId ?? ""}
            onChange={(e) => update.mutate({ assigneeAgentId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {agents.filter((a) => a.status !== "terminated").map((a) => (
              <option key={a.id} value={a.id}>@{a.name}</option>
            ))}
          </select>
          <ClassicLink path={`/${company.issuePrefix}/issues/${issue.identifier}`}>Classic ↗</ClassicLink>
        </div>
      </div>

      {issue.status === "blocked" && <BlockedBy issueId={issueId} />}

      {pending.map((i) => (
        <InteractionDialog key={i.id} interaction={i} />
      ))}

      <h4 className="px-label" style={{ margin: "14px 4px 4px" }}>THREAD</h4>
      {comments.isLoading && <div className="muted">Loading…</div>}
      {comments.data?.length === 0 && <div className="muted">No one has said anything yet.</div>}
      {comments.data?.map((c) => {
        const author = agentById(c.authorAgentId);
        return (
          <div key={c.id} className={`chat-line ${author ? "" : "me"}`}>
            <Avatar agent={author} size={28} />
            <div className="bubble">
              <span className="who">
                {author?.name ?? "YOU"} · {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {c.body}
            </div>
          </div>
        );
      })}

      <textarea className="px-textarea" aria-label="Write a comment" placeholder="Say something to the team…" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button className="px-btn primary" disabled={!draft.trim() || comment.isPending} onClick={() => comment.mutate()}>
        💬 Post
      </button>
    </>
  );
}

/** "Blocked" on its own is alarming; say what the task is waiting on and let the CEO jump there. */
function BlockedBy({ issueId }: { issueId: string }) {
  const { agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { data } = useQuery({ queryKey: ["blockers", issueId], queryFn: () => api.issueBlockers(issueId), refetchInterval: 30_000 });
  if (!data) return null;
  const waiting = data.blockers.filter((b) => b.status !== "done" && b.status !== "cancelled");
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--bad)" }}>
      <h4>⛔ WAITING ON</h4>
      {waiting.length === 0 ? (
        <div>{data.diagnosis ?? "Nothing listed. It may be waiting on a person; check the thread below."}</div>
      ) : (
        waiting.map((b) => (
          <button key={b.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: b.id })}>
            {b.identifier} · {b.title}
            <small style={{ color: "var(--muted)" }}>
              {b.status.replace("_", " ")} · {agentById(b.assigneeAgentId)?.name ?? "unassigned"}
            </small>
          </button>
        ))
      )}
      <div className="muted" style={{ fontSize: 16, marginTop: 4 }}>This unblocks on its own when those finish.</div>
    </div>
  );
}
