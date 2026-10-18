import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue, IssueStatus } from "../api/types";
import { keys, useProjects } from "../api/hooks";
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

// `drop` is the status a note gets when it is dragged into that column.
const COLUMNS: { title: string; statuses: IssueStatus[]; drop: IssueStatus }[] = [
  { title: "TO DO", statuses: ["backlog", "todo", "blocked"], drop: "todo" },
  { title: "DOING", statuses: ["in_progress"], drop: "in_progress" },
  { title: "REVIEW", statuses: ["in_review"], drop: "in_review" },
  { title: "DONE", statuses: ["done"], drop: "done" },
];

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const DONE_SHOWN = 12;

export interface BoardFilter {
  q: string;
  agent: string;
  project: string;
  priority: string;
}
const NO_FILTER: BoardFilter = { q: "", agent: "", project: "", priority: "" };
const FILTER_KEY = "pixel-office:board-filter";

function loadFilter(): BoardFilter {
  try {
    return { ...NO_FILTER, ...JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? "{}") };
  } catch {
    return NO_FILTER;
  }
}

export function matchesFilter(i: Issue, f: BoardFilter): boolean {
  if (f.agent && (f.agent === "none" ? i.assigneeAgentId : i.assigneeAgentId !== f.agent)) return false;
  if (f.project && (f.project === "none" ? i.projectId : i.projectId !== f.project)) return false;
  if (f.priority && i.priority !== f.priority) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !`${i.identifier} ${i.title} ${i.description ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}

export function MeetingPanel() {
  const { company, issues, agents, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const { data: projects } = useProjects(company.id);
  const [filter, setFilterState] = useState<BoardFilter>(loadFilter);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const setFilter = (patch: Partial<BoardFilter>) =>
    setFilterState((f) => {
      const next = { ...f, ...patch };
      try {
        sessionStorage.setItem(FILTER_KEY, JSON.stringify(next));
      } catch {
        /* not persisted */
      }
      return next;
    });

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

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IssueStatus }) => api.updateIssue(id, { status }),
    onMutate: async ({ id, status }) => {
      // Move the note at once; roll back if Paperclip refuses.
      const key = keys.issues(company.id);
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Issue[]>(key);
      qc.setQueryData<Issue[]>(key, (list) => list?.map((i) => (i.id === id ? { ...i, status } : i)));
      return { before };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.issues(company.id), ctx.before);
      toast(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.issues(company.id) }),
  });

  const onDrop = (col: (typeof COLUMNS)[number], e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/x-issue-id");
    const issue = issues.find((i) => i.id === id);
    if (!issue || col.statuses.includes(issue.status)) return;
    if (col.drop === "done" && !confirm(`Mark ${issue.identifier} as done?`)) return;
    move.mutate({ id, status: col.drop });
  };

  const filtered = Object.values(filter).some(Boolean);
  const visible = issues
    .filter((i) => i.status !== "cancelled" && !i.hiddenAt && matchesFilter(i, filter))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.updatedAt.localeCompare(a.updatedAt));

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

      <div className="row board-filters">
        <input
          className="px-input"
          style={{ flex: 2, minWidth: 140, margin: 0 }}
          aria-label="Search tasks"
          placeholder="🔍 Search tasks…"
          value={filter.q}
          onChange={(e) => setFilter({ q: e.target.value })}
        />
        <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Filter by employee" value={filter.agent} onChange={(e) => setFilter({ agent: e.target.value })}>
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {staff.map((a) => (
            <option key={a.id} value={a.id}>@{a.name}</option>
          ))}
        </select>
        {(projects?.length ?? 0) > 0 && (
          <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Filter by project" value={filter.project} onChange={(e) => setFilter({ project: e.target.value })}>
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Filter by priority" value={filter.priority} onChange={(e) => setFilter({ priority: e.target.value })}>
          <option value="">Any priority</option>
          {Object.keys(PRIORITY_RANK).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {filtered && (
          <button className="px-btn small" onClick={() => setFilter(NO_FILTER)}>
            Clear
          </button>
        )}
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => {
          const all = visible.filter((i) => col.statuses.includes(i.status));
          const notes = col.drop === "done" && !allDone && !filtered ? all.slice(0, DONE_SHOWN) : all;
          return (
            <div
              key={col.title}
              className={`col ${dragOver === col.title ? "drag-over" : ""}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("text/x-issue-id")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(col.title);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
              }}
              onDrop={(e) => onDrop(col, e)}
            >
              <h5>
                {col.title} <span className="muted">{all.length}</span>
              </h5>
              {notes.map((i) => (
                <StickyNote key={i.id} issue={i} assignee={agentById(i.assigneeAgentId)?.name} onOpen={() => open({ kind: "issue", issueId: i.id })} />
              ))}
              {notes.length < all.length && (
                <button className="px-btn small" onClick={() => setAllDone(true)}>
                  +{all.length - notes.length} older
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>
        {filtered ? `Showing ${visible.length} matching tasks. ` : ""}Tip: drag a sticky note to another column to change its status.
      </div>
    </>
  );
}

function StickyNote({ issue, assignee, onOpen }: { issue: Issue; assignee?: string; onOpen: () => void }) {
  const source = extractSources(issue.description)[0];
  return (
    <button
      className="sticky"
      style={{ background: NOTE_COLORS[issue.status] }}
      onClick={onOpen}
      title={source ? `From ${source.key}` : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-issue-id", issue.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <span className="id">
        {issue.identifier}
        {issue.status === "blocked" ? " · BLOCKED" : ""}
        {issue.priority === "critical" ? " · ‼" : issue.priority === "high" ? " · !" : ""}
        {source ? ` · ${SOURCE_ICON[source.source]} ${source.key}` : ""}
      </span>
      {issue.title}
      {assignee && <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>@{assignee}</div>}
    </button>
  );
}
