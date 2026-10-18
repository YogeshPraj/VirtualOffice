import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue, IssueStatus } from "../api/types";
import { keys } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { extractSources, SOURCE_ICON } from "../lib/links";

export const NOTE_COLORS: Record<IssueStatus, string> = {
  backlog: "#e0e0e0",
  todo: "#FFE27A",
  in_progress: "#8FD3FF",
  in_review: "#C9A7FF",
  blocked: "#FF8A8A",
  done: "#9BE59B",
  cancelled: "#cfcfcf",
};

const COLUMNS: { title: string; statuses: IssueStatus[] }[] = [
  { title: "TO DO", statuses: ["backlog", "todo", "blocked"] },
  { title: "DOING", statuses: ["in_progress"] },
  { title: "REVIEW", statuses: ["in_review"] },
  { title: "DONE", statuses: ["done"] },
];

export function MeetingPanel() {
  const { company, issues, agents, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");

  const create = useMutation({
    mutationFn: () =>
      api.createIssue(company.id, {
        title: title.trim(),
        description: desc.trim() || undefined,
        assigneeAgentId: assignee || null,
        status: "todo",
      }),
    onSuccess: (issue) => {
      toast(`Pinned ${issue.identifier} to the board.`);
      setTitle("");
      setDesc("");
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  const visible = issues.filter((i) => i.status !== "cancelled");

  return (
    <>
      <div className="px-card">
        <h4>NEW STICKY NOTE</h4>
        <input className="px-input" aria-label="Task title" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="px-textarea" aria-label="Details" placeholder="Details, acceptance criteria, links…" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="row">
          <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((a) => (
              <option key={a.id} value={a.id}>→ {a.name}</option>
            ))}
          </select>
          <button className="px-btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            📌 Pin it
          </button>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => {
          const notes = visible.filter((i) => col.statuses.includes(i.status));
          return (
            <div key={col.title} className="col">
              <h5>
                {col.title} <span className="muted">{notes.length}</span>
              </h5>
              {notes.map((i) => (
                <StickyNote key={i.id} issue={i} assignee={agentById(i.assigneeAgentId)?.name} onOpen={() => open({ kind: "issue", issueId: i.id })} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function StickyNote({ issue, assignee, onOpen }: { issue: Issue; assignee?: string; onOpen: () => void }) {
  const source = extractSources(issue.description)[0];
  return (
    <button className="sticky" style={{ background: NOTE_COLORS[issue.status] }} onClick={onOpen} title={source ? `From ${source.key}` : undefined}>
      <span className="id">
        {issue.identifier}
        {issue.status === "blocked" ? " · BLOCKED" : ""}
        {source ? ` · ${SOURCE_ICON[source.source]} ${source.key}` : ""}
      </span>
      {issue.title}
      {assignee && <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>@{assignee}</div>}
    </button>
  );
}
