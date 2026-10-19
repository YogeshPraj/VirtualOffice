import { useEffect, useRef, useState } from "react";
import { FOCUS_NEW_TASK } from "../ui/Shortcuts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue, IssueStatus } from "../api/types";
import { keys, useProjects } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { extractSources, SOURCE_ICON } from "../lib/links";
import { isQuestion } from "./AskEmployee";
import { driftFor, useSources, type SourceState } from "../lib/drift";
import { TemplateEditor } from "./TemplateEditor";
import { BulkBar } from "./BulkBar";
import { SavedViews } from "./SavedViews";
import { FocusStrip } from "./FocusStrip";
import { DUE_ICON, dueLabel, dueState, useDue } from "../lib/due";
import { checklist } from "../lib/checklist";
import { awayBaseline } from "../ui/SinceAway";
import { fill, resolveAssignee, useTemplates } from "../lib/templates";
import { useDraft } from "../lib/useDraft";

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
  const [title, setTitle, clearTitle] = useDraft("note:title");
  const [desc, setDesc, clearDesc] = useDraft("note:details");
  const [assignee, setAssignee] = useState("");
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const { data: projects } = useProjects(company.id);
  const [filter, setFilterState] = useState<BoardFilter>(loadFilter);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [priority, setPriority] = useState<Issue["priority"]>("medium");
  const [editing, setEditing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => titleRef.current?.focus();
    window.addEventListener(FOCUS_NEW_TASK, focus);
    return () => window.removeEventListener(FOCUS_NEW_TASK, focus);
  }, []);
  const { data: templates = [] } = useTemplates();
  const { data: sources } = useSources();
  const { due } = useDue();
  const [since] = useState(awayBaseline);
  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Whatever was typed in the title becomes the {what}.
    const what = title.trim();
    setTitle(fill(t.title, what));
    setDesc(fill(t.description, what));
    setPriority(t.priority);
    setAssignee(resolveAssignee(t, agents) ?? "");
  };

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
        priority,
      }),
    onSuccess: (issue) => {
      toast(`Pinned ${issue.identifier} to the board.`);
      clearTitle();
      clearDesc();
      setPriority("medium");
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
    onSuccess: (_d, v, ctx) => {
      const was = ctx?.before?.find((i) => i.id === v.id);
      if (was && was.status !== v.status)
        toast(`${was.identifier} moved to ${v.status.replace("_", " ")}.`, {
          undo: async () => {
            await api.updateIssue(v.id, { status: was.status });
            qc.invalidateQueries({ queryKey: keys.issues(company.id) });
          },
        });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.issues(company.id) }),
  });

  /** Arrow keys walk the board; Shift+Left/Right moves the focused note to the next column. */
  const onBoardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const board = e.currentTarget;
    if (!el.classList.contains("sticky")) return;
    const col = Number(el.dataset.col);
    const row = Number(el.dataset.row);
    const focusAt = (c: number, r: number) => {
      const notes = [...board.querySelectorAll<HTMLElement>(`.sticky[data-col="${c}"]`)];
      if (!notes.length) return false;
      notes[Math.max(0, Math.min(notes.length - 1, r))].focus();
      return true;
    };
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const target = COLUMNS[col + (e.key === "ArrowRight" ? 1 : -1)];
      const issue = issues.find((i) => i.id === el.dataset.id);
      if (!target || !issue || target.statuses.includes(issue.status)) return;
      if (target.drop === "done" && !confirm(`Mark ${issue.identifier} as done?`)) return;
      move.mutate({ id: issue.id, status: target.drop });
      // Follow the note to its new column once it has moved.
      setTimeout(() => board.querySelector<HTMLElement>(`.sticky[data-id="${issue.id}"]`)?.focus(), 80);
      return;
    }
    const step: Record<string, [number, number]> = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    if (d[0] === 0) focusAt(col, row + d[1]);
    else for (let c = col + d[0]; c >= 0 && c < COLUMNS.length; c += d[0]) if (focusAt(c, row)) break;
  };

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
    .filter((i) => i.status !== "cancelled" && !i.hiddenAt && (showQuestions || !isQuestion(i)) && matchesFilter(i, filter))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <div className="px-card">
        <div className="row">
          <h4 style={{ flex: 1, margin: 0 }}>NEW STICKY NOTE</h4>
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Start from a template" value="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">🧩 From a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
          <button className="px-btn small" title="Edit templates" aria-label="Edit templates" onClick={() => setEditing((v) => !v)}>
            ✎
          </button>
        </div>
        <input ref={titleRef} className="px-input" aria-label="Task title" placeholder="What needs doing? (pick a template after typing to fill it in)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="px-textarea" aria-label="Details" placeholder="Details, acceptance criteria, links…" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="row">
          <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((a) => (
              <option key={a.id} value={a.id}>→ {a.name}</option>
            ))}
          </select>
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Issue["priority"])}>
            {Object.keys(PRIORITY_RANK).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="px-btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            📌 Pin it
          </button>
        </div>
      </div>
      {editing && <TemplateEditor onClose={() => setEditing(false)} />}

      <FocusStrip />
      <SavedViews
        filter={filter}
        questions={showQuestions}
        onApply={(v) => {
          setFilter({ ...NO_FILTER, ...v.filter });
          setShowQuestions(!!v.questions);
        }}
      />
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
        <label style={{ cursor: "pointer", fontSize: 16 }} title="Questions you asked employees">
          <input type="checkbox" checked={showQuestions} onChange={(e) => setShowQuestions(e.target.checked)} /> 💬 questions
        </label>
        <button
          className={`px-btn small ${selecting ? "primary" : ""}`}
          onClick={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
          }}
          title="Select several notes to change them together"
        >
          ☑ Select
        </button>
        {filtered && (
          <button className="px-btn small" onClick={() => setFilter(NO_FILTER)}>
            Clear
          </button>
        )}
      </div>

      {selecting && selected.size > 0 && (
        <BulkBar
          selected={selected}
          onClear={() => {
            setSelected(new Set());
            setSelecting(false);
          }}
        />
      )}
      {selecting && selected.size === 0 && <div className="muted" style={{ fontSize: 16, margin: "0 0 6px" }}>Click notes to select them.</div>}
      <div className="kanban" onKeyDown={onBoardKey} aria-label="Task board: arrow keys move between notes, Shift+arrows move a note between columns">
        {COLUMNS.map((col, colIndex) => {
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
              {notes.map((i, rowIndex) => (
                <StickyNote
                  key={i.id}
                  issue={i}
                  due={due[i.id]}
                  col={colIndex}
                  row={rowIndex}
                  sources={sources}
                  assignee={agentById(i.assigneeAgentId)?.name}
                  selected={selecting ? selected.has(i.id) : undefined}
                  changed={!!since && Date.parse(i.updatedAt) > since}
                  onOpen={() => (selecting ? toggle(i.id) : open({ kind: "issue", issueId: i.id }))}
                />
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
        {filtered ? `Showing ${visible.length} matching tasks. ` : ""}Tip: drag a note to another column to change its status, or use the arrow keys and Shift+←/→.
      </div>
    </>
  );
}

function StickyNote({
  issue,
  assignee,
  onOpen,
  sources,
  selected,
  changed,
  col,
  row,
  due,
}: {
  issue: Issue;
  assignee?: string;
  onOpen: () => void;
  sources?: Record<string, SourceState>;
  /** undefined = not in select mode */
  selected?: boolean;
  /** Changed since the CEO was last here. */
  changed?: boolean;
  col?: number;
  row?: number;
  due?: string;
}) {
  const source = extractSources(issue.description)[0];
  const drift = driftFor(issue, sources);
  const list = checklist(issue.description);
  return (
    <button
      className={`sticky ${selected ? "selected" : ""} ${changed ? "changed" : ""}`}
      aria-pressed={selected}
      data-id={issue.id}
      data-col={col}
      data-row={row}
      style={{ background: NOTE_COLORS[issue.status] }}
      onClick={onOpen}
      title={source ? `From ${source.key}` : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-issue-id", issue.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {selected !== undefined && <span className="pick">{selected ? "☑" : "☐"}</span>}
      <span className="id">
        {issue.identifier}
        {issue.status === "blocked" ? " · BLOCKED" : ""}
        {issue.priority === "critical" ? " · ‼" : issue.priority === "high" ? " · !" : ""}
        {source ? ` · ${SOURCE_ICON[source.source]} ${source.key}` : ""}
        {drift?.kind === "closed-at-source" ? ` · ⚠ ${drift.state.toUpperCase()} AT SOURCE` : ""}
      </span>
      {issue.title}
      {assignee && <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>@{assignee}</div>}
      {list.total > 0 && (
        <div className="note-checklist" title={`${list.done} of ${list.total} checklist items done`}>
          <span>☑ {list.done}/{list.total}</span>
          <span className="bar">
            <span style={{ width: `${(list.done / list.total) * 100}%` }} />
          </span>
        </div>
      )}
      {due && issue.status !== "done" && issue.status !== "cancelled" && (
        <div className={`due-badge due-${dueState(due)}`}>
          {DUE_ICON[dueState(due)]} {dueLabel(due)}
        </div>
      )}
    </button>
  );
}
