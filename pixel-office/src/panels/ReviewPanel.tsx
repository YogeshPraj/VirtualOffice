import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useComments } from "../api/hooks";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Markdown } from "../lib/markdown";
import { useOfficeLinks } from "./TaskDocuments";
import { isQuestion } from "./AskEmployee";
import { QuickReplies } from "../ui/QuickReplies";
import { checklistItems } from "../lib/checklist";

/** Tasks waiting for the CEO's review, oldest first. */
export const reviewQueue = (issues: Issue[]) =>
  issues.filter((i) => i.status === "in_review" && !isQuestion(i) && !i.hiddenAt).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

const since = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

/** The review room: one task at a time, approve or send back. j/k move, a approves, s sends back. */
export function ReviewPanel() {
  const { issues } = useOfficeData();
  const queue = reviewQueue(issues);
  const [index, setIndex] = useState(0);
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "j") setIndex((i) => Math.min(queue.length - 1, i + 1));
      else if (e.key === "k") setIndex((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [queue.length]);

  if (!queue.length) {
    return (
      <div className="px-card" style={{ textAlign: "center" }}>
        <h4>🔍 NOTHING TO REVIEW</h4>
        <div className="muted">When an employee puts a task up for review, it lands here.</div>
      </div>
    );
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <b style={{ flex: 1 }}>
          {Math.min(index, queue.length - 1) + 1} of {queue.length} waiting for your review
        </b>
        <button className="px-btn small" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} title="Previous (k)">
          ◀
        </button>
        <button className="px-btn small" disabled={index >= queue.length - 1} onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))} title="Next (j)">
          ▶
        </button>
      </div>
      {current && <ReviewItem key={current.id} issue={current} onDone={() => setIndex((i) => Math.max(0, Math.min(i, queue.length - 2)))} />}
      <div className="muted" style={{ fontSize: 14 }}>Keys: j / k next and previous, a approve, s send back.</div>
    </>
  );
}

function ReviewItem({ issue, onDone }: { issue: Issue; onDone: () => void }) {
  const { company, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const links = useOfficeLinks();
  const qc = useQueryClient();
  const comments = useComments(issue.id);
  const products = useQuery({ queryKey: ["work-products", issue.id], queryFn: () => api.workProducts(issue.id) });
  const docs = useQuery({ queryKey: ["documents", issue.id], queryFn: () => api.issueDocuments(issue.id) });
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const who = agentById(issue.assigneeAgentId);
  const latest = [...(comments.data ?? [])].reverse().find((c) => c.authorAgentId);
  const items = checklistItems(issue.description);
  const open_ = items.filter((i) => !i.done).length;
  // Approving with boxes still open is allowed, but never by accident.
  const confirmApprove = () =>
    confirm(open_ ? `${open_} of ${items.length} checklist items on ${issue.identifier} aren't ticked. Approve and mark it done anyway?` : `Approve ${issue.identifier} and mark it done?`);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    qc.invalidateQueries({ queryKey: keys.comments(issue.id) });
  };
  const approve = useMutation({
    mutationFn: async () => {
      if (note.trim()) await api.addComment(issue.id, `**Approved by the CEO.** ${note.trim()}`);
      await api.updateIssue(issue.id, { status: "done" });
    },
    onSuccess: () => {
      toast(`Approved ${issue.identifier}.`);
      refresh();
      onDone();
    },
    onError: (e: Error) => toast(e.message),
  });
  const sendBack = useMutation({
    mutationFn: async () => {
      await api.addComment(issue.id, `**Sent back by the CEO:** ${note.trim()}`);
      await api.updateIssue(issue.id, { status: "todo" });
      if (issue.assigneeAgentId) await api.wakeOnIssue(issue.assigneeAgentId, issue.id, "The CEO sent this back from review with notes").catch(() => undefined);
    },
    onSuccess: () => {
      toast(`Sent ${issue.identifier} back to ${who?.name ?? "the team"}.`);
      refresh();
      onDone();
    },
    onError: (e: Error) => toast(e.message),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "a") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!approve.isPending && confirmApprove()) approve.mutate();
      } else if (e.key === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        noteRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [issue.id, approve, confirmApprove]);

  return (
    <div className="px-card" style={{ borderLeft: "8px solid #C9A7FF" }}>
      <div className="row" style={{ margin: 0 }}>
        <h4 style={{ flex: 1, margin: 0 }}>
          {issue.identifier} · {issue.title}
        </h4>
        <button className="px-btn small" onClick={() => open({ kind: "issue", issueId: issue.id })}>
          Open ↗
        </button>
      </div>
      <div className="muted" style={{ fontSize: 16 }}>
        By {who?.name ?? "someone"} · waiting {since(issue.updatedAt)} · {issue.priority} priority
      </div>

      {(products.data?.length ?? 0) > 0 && (
        <div style={{ margin: "6px 0" }}>
          {products.data!.map((w) => (
            <div key={w.id} style={{ fontSize: 16 }}>
              🛠{" "}
              {w.url ? (
                <a href={w.url} target="_blank" rel="noreferrer">
                  {w.title}
                </a>
              ) : (
                w.title
              )}{" "}
              <span className="muted">· {w.status.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
      {(docs.data?.length ?? 0) > 0 && (
        <div style={{ fontSize: 16, margin: "4px 0" }}>
          📎 {docs.data!.map((d) => d.title || d.key).join(" · ")} <span className="muted">(open the task to read)</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="review-checklist" aria-label="Checklist">
          <h5 className="px-label" style={{ margin: "8px 0 4px" }}>
            CHECKLIST · {items.length - open_} OF {items.length} TICKED
          </h5>
          {items.map((it, n) => (
            <div key={n} style={{ fontSize: 16, color: it.done ? undefined : "var(--bad)" }}>
              {it.done ? "✅" : "⬜"} {it.text}
            </div>
          ))}
        </div>
      )}

      <h5 className="px-label" style={{ margin: "8px 0 4px" }}>LATEST FROM {who?.name.toUpperCase() ?? "THE TEAM"}</h5>
      <div className="doc-view" style={{ maxHeight: 280 }}>
        {latest ? <Markdown text={latest.body} links={links} /> : <span className="muted">{comments.isLoading ? "Loading…" : "No update in the thread."}</span>}
      </div>

      <textarea
        ref={noteRef}
        className="px-textarea"
        aria-label="Note for the team"
        style={{ minHeight: 60 }}
        placeholder="A note: required to send back, optional when approving."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <QuickReplies value={note} onChange={setNote} />
      <div className="row">
        <button className="px-btn good" disabled={approve.isPending || sendBack.isPending} onClick={() => confirmApprove() && approve.mutate()}>
          ✔ Approve
        </button>
        <button className="px-btn" disabled={!note.trim() || approve.isPending || sendBack.isPending} onClick={() => sendBack.mutate()}>
          ↩ Send back
        </button>
      </div>
    </div>
  );
}
