import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useProjects } from "../api/hooks";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { NOTE_COLORS } from "./MeetingPanel";

const PRIORITIES: Issue["priority"][] = ["critical", "high", "medium", "low"];
const MAX_UPLOAD = 20 * 1024 * 1024;

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Priority, project, parent and sub-tasks, blockers and attachments for one task. */
export function TaskDetails({ issue }: { issue: Issue }) {
  const { company, issues, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data: projects } = useProjects(company.id);
  const { data: full } = useQuery({ queryKey: ["issue", issue.id, issue.updatedAt], queryFn: () => api.issue(issue.id) });
  const [subTitle, setSubTitle] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    qc.invalidateQueries({ queryKey: ["issue", issue.id] });
  };
  const update = useMutation({
    mutationFn: (body: Parameters<typeof api.updateIssue>[1]) => api.updateIssue(issue.id, body),
    onSuccess: refresh,
    onError: (e: Error) => toast(e.message),
  });
  const addSub = useMutation({
    mutationFn: () =>
      api.createIssue(company.id, {
        title: subTitle.trim(),
        parentId: issue.id,
        projectId: issue.projectId,
        assigneeAgentId: issue.assigneeAgentId,
        status: "todo",
      }),
    onSuccess: (sub) => {
      toast(`Added ${sub.identifier} under ${issue.identifier}.`);
      setSubTitle("");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });

  // A task can't sit under itself or its own descendants.
  const descendants = new Set<string>([issue.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const i of issues) if (i.parentId && descendants.has(i.parentId) && !descendants.has(i.id)) grew = descendants.add(i.id) && true;
  }
  const candidates = issues.filter((i) => !descendants.has(i.id) && i.status !== "cancelled" && !i.hiddenAt);
  const parent = issues.find((i) => i.id === issue.parentId);
  const children = issues.filter((i) => i.parentId === issue.id && i.status !== "cancelled");
  const blockedBy = full?.blockedBy ?? [];
  const blocks = full?.blocks ?? [];
  const blockerIds = blockedBy.map((b) => b.id);

  const Chip = ({ i, onRemove }: { i: { id: string; identifier: string; title: string; status: string }; onRemove?: () => void }) => (
    <span className="task-chip" style={{ background: NOTE_COLORS[i.status as Issue["status"]] ?? "#eee" }}>
      <a href="#" title={i.title} onClick={(e) => (e.preventDefault(), open({ kind: "issue", issueId: i.id }))}>
        {i.identifier}
      </a>{" "}
      <small>{i.status.replace("_", " ")}</small>
      {onRemove && (
        <button className="chip-x" aria-label={`Remove ${i.identifier}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );

  return (
    <div className="px-card">
      <h4>🗂 DETAILS</h4>
      <div className="detail-grid">
        <label>Priority</label>
        <select className="px-select" aria-label="Priority" value={issue.priority} onChange={(e) => update.mutate({ priority: e.target.value as Issue["priority"] })}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <label>Project</label>
        <select className="px-select" aria-label="Project" value={issue.projectId ?? ""} onChange={(e) => update.mutate({ projectId: e.target.value || null })}>
          <option value="">No project</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label>Parent</label>
        <div className="row" style={{ margin: 0 }}>
          <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Parent task" value={issue.parentId ?? ""} onChange={(e) => update.mutate({ parentId: e.target.value || null })}>
            <option value="">None (top level)</option>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>{i.identifier} · {i.title.slice(0, 60)}</option>
            ))}
          </select>
          {parent && (
            <button className="px-btn small" onClick={() => open({ kind: "issue", issueId: parent.id })}>
              Open ↗
            </button>
          )}
        </div>
      </div>

      <h5 className="px-label" style={{ margin: "10px 0 4px" }}>SUB-TASKS {children.length > 0 && <span className="muted">{children.filter((c) => c.status === "done").length}/{children.length} done</span>}</h5>
      {children.length === 0 && <div className="muted">None yet.</div>}
      {children.map((c) => (
        <button key={c.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: c.id })}>
          {c.status === "done" ? "☑" : "☐"} {c.identifier} · {c.title}
          <small style={{ color: "var(--muted)" }}>
            {c.status.replace("_", " ")} · {agentById(c.assigneeAgentId)?.name ?? "unassigned"}
          </small>
        </button>
      ))}
      <div className="row">
        <input
          className="px-input"
          style={{ flex: 1, margin: 0 }}
          aria-label="New sub-task"
          placeholder="Add a sub-task…"
          value={subTitle}
          onChange={(e) => setSubTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && subTitle.trim() && addSub.mutate()}
        />
        <button className="px-btn small" disabled={!subTitle.trim() || addSub.isPending} onClick={() => addSub.mutate()}>
          + Add
        </button>
      </div>

      <h5 className="px-label" style={{ margin: "10px 0 4px" }}>BLOCKED BY</h5>
      <div>
        {blockedBy.length === 0 && <span className="muted">Nothing. </span>}
        {blockedBy.map((b) => (
          <Chip key={b.id} i={b} onRemove={() => update.mutate({ blockedByIssueIds: blockerIds.filter((x) => x !== b.id) })} />
        ))}
      </div>
      <select
        className="px-select"
        aria-label="Add a blocker"
        value=""
        onChange={(e) => e.target.value && update.mutate({ blockedByIssueIds: [...blockerIds, e.target.value] })}
      >
        <option value="">+ Wait on another task…</option>
        {candidates
          .filter((i) => i.id !== issue.id && !blockerIds.includes(i.id) && i.status !== "done")
          .map((i) => (
            <option key={i.id} value={i.id}>{i.identifier} · {i.title.slice(0, 60)}</option>
          ))}
      </select>
      {blocks.length > 0 && (
        <>
          <h5 className="px-label" style={{ margin: "10px 0 4px" }}>HOLDING UP</h5>
          <div>
            {blocks.map((b) => (
              <Chip key={b.id} i={b} />
            ))}
          </div>
        </>
      )}

      <Attachments issueId={issue.id} />
    </div>
  );
}

function Attachments({ issueId }: { issueId: string }) {
  const { company, agentById, toast } = useOfficeData();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ["attachments", issueId], queryFn: () => api.attachments(issueId) });
  const upload = useMutation({
    mutationFn: (f: File) => {
      if (f.size > MAX_UPLOAD) throw new Error(`${f.name} is over ${fmtBytes(MAX_UPLOAD)}.`);
      return api.uploadAttachment(company.id, issueId, f);
    },
    onSuccess: () => {
      toast("Attached.");
      qc.invalidateQueries({ queryKey: ["attachments", issueId] });
    },
    onError: (e: Error) => toast(e.message),
  });
  const list = data ?? [];
  return (
    <>
      <h5 className="px-label" style={{ margin: "10px 0 4px" }}>ATTACHMENTS {list.length > 0 && <span className="muted">{list.length}</span>}</h5>
      <div className="attach-grid">
        {list.map((a) => {
          const url = `/api/attachments/${a.id}/content`;
          const image = a.contentType.startsWith("image/");
          return (
            <a key={a.id} className="attach" href={url} target="_blank" rel="noreferrer" title={`${a.originalFilename ?? "file"} · ${fmtBytes(a.byteSize)}`}>
              {image ? <img src={url} alt={a.originalFilename ?? "attachment"} loading="lazy" /> : <span style={{ fontSize: 28 }}>📄</span>}
              <small>{a.originalFilename ?? "file"}</small>
              <small className="muted">{agentById(a.createdByAgentId)?.name ?? "you"}</small>
            </a>
          );
        })}
      </div>
      <input
        ref={file}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <button className="px-btn small" disabled={upload.isPending} onClick={() => file.current?.click()}>
        {upload.isPending ? "Uploading…" : "📎 Attach a file"}
      </button>
    </>
  );
}
