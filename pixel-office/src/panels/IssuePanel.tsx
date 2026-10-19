import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue, IssueStatus } from "../api/types";
import { keys, useComments, useInteractions } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { ClassicLink } from "../ui/Window";
import { InteractionDialog } from "./InteractionDialog";
import { NOTE_COLORS } from "./MeetingPanel";
import { extractSources, SOURCE_ICON } from "../lib/links";
import { Markdown } from "../lib/markdown";
import { TaskDocuments, useOfficeLinks } from "./TaskDocuments";
import { TaskDetails } from "./TaskDetails";
import { WorkProducts } from "./WorkProducts";
import { LastShift } from "./LastShift";
import { TaskHistory } from "./TaskHistory";
import { TaskMap } from "./TaskMap";
import { MAX_FOCUS, useFocus } from "../lib/focus";
import { taskMarkdown } from "../lib/taskExport";
import { downloadText, slug } from "../lib/download";
import { driftFor, useSources } from "../lib/drift";
import { linkMentions } from "../lib/mentions";
import { MentionTextarea } from "../ui/MentionTextarea";
import { QuickReplies } from "../ui/QuickReplies";
import { useDraft } from "../lib/useDraft";
import { describeChange, inverseOf, isEmpty } from "../lib/undo";

const STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

/** Long threads show their latest comments; the rest fold behind "Show N earlier". */
export const THREAD_TAIL = 6;
export type ThreadFilter = "all" | "team" | "me";

export function visibleThread<T extends { authorAgentId: string | null }>(comments: T[], filter: ThreadFilter, tail: number) {
  const matching = comments.filter((c) => (filter === "team" ? !!c.authorAgentId : filter === "me" ? !c.authorAgentId : true));
  // Don't fold just one or two: only hide when it saves a real scroll.
  if (matching.length <= tail + 2) return { items: matching, hidden: 0 };
  return { items: matching.slice(-tail), hidden: matching.length - tail };
}

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
  const [draft, setDraft, clearDraft, restoredDraft] = useDraft(`comment:${issueId}`);
  const links = useOfficeLinks();
  const focus = useFocus();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    qc.invalidateQueries({ queryKey: keys.comments(issueId) });
  };
  const update = useMutation({
    mutationFn: (body: Parameters<typeof api.updateIssue>[1]) => api.updateIssue(issueId, body),
    onSuccess: (_d, body) => {
      refresh();
      const back = issue ? inverseOf(issue, body) : {};
      if (issue && !isEmpty(back))
        toast(`${issue.identifier} ${describeChange(body, (id) => agentById(id)?.name)}.`, {
          undo: async () => {
            await api.updateIssue(issueId, back);
            refresh();
          },
        });
    },
    onError: (e: Error) => toast(e.message),
  });
  const people = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const [pasting, setPasting] = useState(false);
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [showAll, setShowAll] = useState(false);
  // Each task opens folded.
  useEffect(() => setShowAll(false), [issueId]);
  /** Upload a pasted screenshot as a task attachment and reference it in the comment being written. */
  const pasteImage = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return toast("That image is over 20 MB.");
    setPasting(true);
    try {
      const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const named = new File([file], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`, { type: file.type });
      const a = await api.uploadAttachment(company.id, issueId, named);
      const ref = `![${named.name}](/api/attachments/${a.id}/content)`;
      setDraft(draft.trim() ? `${draft.trimEnd()}\n\n${ref}\n` : `${ref}\n`);
      qc.invalidateQueries({ queryKey: ["attachments", issueId] });
    } catch (e) {
      toast(`Couldn't attach the screenshot: ${(e as Error).message}`);
    } finally {
      setPasting(false);
    }
  };
  const comment = useMutation({
    mutationFn: async () => {
      // "@Ada" becomes Paperclip's mention link, and whoever is mentioned is woken on this task.
      const { body, ids } = linkMentions(draft.trim(), people);
      await api.addComment(issueId, body);
      const woken: string[] = [];
      for (const id of ids) {
        if (id === issue?.assigneeAgentId) continue; // the assignee already hears about new comments
        try {
          await api.wakeOnIssue(id, issueId, "Mentioned by the CEO in a comment");
          woken.push(agentById(id)?.name ?? "someone");
        } catch {
          /* the comment still landed; the mention link is there for them */
        }
      }
      return woken;
    },
    onSuccess: (woken) => {
      clearDraft();
      refresh();
      if (woken.length) toast(`Pinged ${woken.join(", ")}.`);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!issue) return <div className="muted">Finding that sticky note…</div>;
  const pending = interactions.data?.filter((i) => i.status === "pending") ?? [];

  return (
    <>
      <div className="px-card note-card" style={{ background: NOTE_COLORS[issue.status as IssueStatus] }}>
        <h4>{issue.identifier}</h4>
        <div style={{ fontSize: 22 }}>{issue.title}</div>
        {issue.description && (
          <div style={{ fontSize: 18 }}>
            <Markdown text={issue.description} links={links} />
          </div>
        )}
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
          <button
            className={`px-btn small ${focus.ids.includes(issue.id) ? "primary" : ""}`}
            aria-pressed={focus.ids.includes(issue.id)}
            title="Pin as one of your priorities"
            onClick={() => focus.toggle(issue.id) || toast(`Your focus list holds ${MAX_FOCUS} tasks; unpin one first.`)}
          >
            {focus.ids.includes(issue.id) ? "★ Focus" : "☆ Focus"}
          </button>
          <ShareTask issue={issue} />
          <ClassicLink path={`/${company.issuePrefix}/issues/${issue.identifier}`}>Classic ↗</ClassicLink>
        </div>
      </div>

      <LinkedWork description={issue.description} done={issue.status === "done"} latestAgentComment={[...(comments.data ?? [])].reverse().find((c) => c.authorAgentId)?.body ?? null} />
      <SourceDrift issue={issue} onStatus={(status) => update.mutate({ status })} />
      <LastShift issue={issue} />
      {issue.status === "blocked" && <BlockedBy issueId={issueId} />}
      <WorkProducts issueId={issueId} projectId={issue.projectId} />
      <TaskDetails issue={issue} />
      <TaskDocuments issueId={issueId} />
      <TaskMap issue={issue} />
      <TaskHistory issue={issue} />

      {pending.map((i) => (
        <InteractionDialog key={i.id} interaction={i} />
      ))}

      <div className="row" style={{ margin: "14px 4px 4px" }}>
        <h4 className="px-label" style={{ margin: 0, flex: 1 }}>
          THREAD {comments.data?.length ? <span className="muted">{comments.data.length}</span> : null}
        </h4>
        {(comments.data?.length ?? 0) > 3 &&
          (["all", "team", "me"] as const).map((f) => (
            <button key={f} className={`reply-chip ${threadFilter === f ? "on" : ""}`} aria-pressed={threadFilter === f} onClick={() => setThreadFilter(f)}>
              {f === "all" ? "All" : f === "team" ? "Employees" : "Mine"}
            </button>
          ))}
      </div>
      {comments.isLoading && <div className="muted">Loading…</div>}
      {comments.data?.length === 0 && <div className="muted">No one has said anything yet.</div>}
      {(() => {
        const shown = visibleThread(comments.data ?? [], threadFilter, showAll ? Infinity : THREAD_TAIL);
        return shown.hidden > 0 ? (
          <button className="px-btn small" style={{ margin: "4px 0" }} onClick={() => setShowAll(true)}>
            ▲ Show {shown.hidden} earlier comment{shown.hidden === 1 ? "" : "s"}
          </button>
        ) : null;
      })()}
      {visibleThread(comments.data ?? [], threadFilter, showAll ? Infinity : THREAD_TAIL).items.map((c) => {
        const author = agentById(c.authorAgentId);
        return (
          <div key={c.id} className={`chat-line ${author ? "" : "me"}`}>
            <Avatar agent={author} size={28} />
            <div className="bubble">
              <span className="who">
                {author?.name ?? "YOU"} · {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <Markdown text={c.body} links={links} />
            </div>
          </div>
        );
      })}

      <MentionTextarea
        className="px-textarea"
        aria-label="Write a comment"
        placeholder="Say something to the team… @ mentions someone, paste a screenshot to attach it (Ctrl+Enter posts)"
        value={draft}
        onChange={setDraft}
        people={people}
        onSubmit={() => draft.trim() && !comment.isPending && comment.mutate()}
        onPaste={(e) => {
          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (!file) return;
          e.preventDefault();
          void pasteImage(file);
        }}
      />
      {pasting && <div className="muted" style={{ fontSize: 14 }}>📎 Attaching the screenshot…</div>}
      <QuickReplies value={draft} onChange={setDraft} />
      {restoredDraft && <div className="muted" style={{ fontSize: 14 }}>📝 Your unsent comment was kept.</div>}
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

interface LiveSource {
  url: string;
  title: string;
  type?: string;
  state?: string;
  error?: string;
  fix?: string;
}

/** The ADO / GitHub items a task is about, with their live state on request. */
function LinkedWork({ description, done, latestAgentComment }: { description: string | null; done: boolean; latestAgentComment: string | null }) {
  const { company } = useOfficeData();
  const qc = useQueryClient();
  const sources = extractSources(description);
  const [live, setLive] = useState<Record<string, LiveSource>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posted, setPosted] = useState<Record<string, boolean>>({});
  const post = useMutation({
    mutationFn: async ({ url, text }: { url: string; text: string }) => {
      const res = await fetch("/office-admin/intake/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fix?: string };
      if (!res.ok) throw new Error(`${data.error ?? "Posting failed"}${data.fix ? ` Fix: ${data.fix}` : ""}`);
    },
    onSuccess: (_d, v) => {
      setPosted((p) => ({ ...p, [v.url]: true }));
      setReporting(null);
    },
  });
  const startReport = (url: string) => {
    const summary = (latestAgentComment ?? "").trim().slice(0, 6000);
    setDraft(`${summary || "Update from the team: "}

(Posted from ${company.name}'s Virtual Office.)`);
    setReporting(url);
  };
  const check = useMutation({
    mutationFn: async () => {
      const res = await fetch("/office-admin/intake/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sources.map((s) => s.url).join(" ") }),
      });
      // Refresh the office's record of these items too (drift badges), without waiting for it.
      fetch("/office-admin/sources/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: sources.map((s) => s.url) }) })
        .then(() => qc.invalidateQueries({ queryKey: ["sources"] }))
        .catch(() => undefined);
      const data = (await res.json().catch(() => ({}))) as { items?: LiveSource[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Lookup failed (${res.status})`);
      return data.items ?? [];
    },
    onSuccess: (items) => setLive(Object.fromEntries(items.map((i) => [i.url, i]))),
  });
  if (sources.length === 0) return null;
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }}>
      <h4>🔗 LINKED WORK</h4>
      {sources.map((s) => {
        const l = live[s.url];
        return (
          <div key={s.key} className="row" style={{ margin: "4px 0", alignItems: "flex-start" }}>
            <span style={{ flex: 1 }}>
              {SOURCE_ICON[s.source]} <b>{s.key}</b> <span className="muted">({s.kind})</span>
              {l && !l.error && (
                <small style={{ display: "block", fontSize: 16 }}>
                  {l.title} · {[l.type, l.state].filter(Boolean).join(" · ")}
                </small>
              )}
              {l?.error && (
                <small style={{ display: "block", fontSize: 16, color: "var(--bad)" }}>
                  ⚠ {l.error}
                  {l.fix ? ` Fix: ${l.fix}` : ""}
                </small>
              )}
            </span>
            <a className="px-btn small" href={s.url} target="_blank" rel="noreferrer">
              Open ↗
            </a>
            <button className={`px-btn small ${done && !posted[s.url] ? "primary" : ""}`} onClick={() => startReport(s.url)}>
              {posted[s.url] ? "✔ Reported" : "📤 Report back"}
            </button>
            {reporting === s.url && (
              <div style={{ width: "100%" }}>
                <div className="muted" style={{ fontSize: 16 }}>
                  This posts a comment on {s.key} as you. Edit it first; nothing is sent until you confirm.
                </div>
                <textarea
                  className="px-textarea"
                  aria-label={`Comment for ${s.key}`}
                  style={{ minHeight: 120 }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="row">
                  <button
                    className="px-btn good small"
                    disabled={!draft.trim() || post.isPending}
                    onClick={() => confirm(`Post this comment on ${s.key} as you?`) && post.mutate({ url: s.url, text: draft })}
                  >
                    {post.isPending ? "Posting…" : `Post to ${s.key}`}
                  </button>
                  <button className="px-btn small" onClick={() => setReporting(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button className="px-btn small" disabled={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? "Checking…" : "↻ Check current state"}
      </button>
    </div>
  );
}

/** The linked ADO/GitHub item moved on without the office: say so, and offer the matching change. */
function SourceDrift({ issue, onStatus }: { issue: Issue; onStatus: (s: IssueStatus) => void }) {
  const { data: sources } = useSources();
  const drift = driftFor(issue, sources);
  if (!drift) return null;
  const since = drift.since ? ` (${new Date(drift.since).toLocaleString([], { dateStyle: "short", timeStyle: "short" })})` : "";
  if (drift.kind === "closed-at-source") {
    return (
      <div className="px-card" style={{ borderLeft: "8px solid var(--accent)" }}>
        <h4>⚠ {drift.key} IS {drift.state.toUpperCase()}</h4>
        <div style={{ fontSize: 17 }}>
          The item this task is about was {drift.state.toLowerCase()} outside the office{since}, but the task is still {issue.status.replace("_", " ")}.
        </div>
        <div className="row">
          <button className="px-btn small good" onClick={() => confirm(`Mark ${issue.identifier} done?`) && onStatus("done")}>✔ Mark done</button>
          <button className="px-btn small" onClick={() => confirm(`Cancel ${issue.identifier}? The team stops working on it.`) && onStatus("cancelled")}>✖ Cancel task</button>
          <a className="px-btn small" href={drift.url} target="_blank" rel="noreferrer">Open {drift.key} ↗</a>
        </div>
      </div>
    );
  }
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }}>
      <h4>ℹ {drift.key} IS STILL {drift.state.toUpperCase()}</h4>
      <div style={{ fontSize: 17 }}>
        The team finished this, but the source item is {drift.state.toLowerCase()}{since}. Report back below, or close it in {drift.url.includes("github.com") ? "GitHub" : "Azure DevOps"}.
      </div>
    </div>
  );
}

/** Copy or download the whole task (details, documents, work products, thread) as Markdown. */
function ShareTask({ issue }: { issue: Issue }) {
  const { agentById, toast } = useOfficeData();
  const [busy, setBusy] = useState(false);
  const build = async () => {
    const [comments, documents, products, attachments] = await Promise.all([
      api.comments(issue.id),
      api.issueDocuments(issue.id).catch(() => []),
      api.workProducts(issue.id).catch(() => []),
      api.attachments(issue.id).catch(() => []),
    ]);
    return taskMarkdown({ issue, comments, documents, products, attachments }, (id) => agentById(id)?.name);
  };
  const run = async (how: "copy" | "file") => {
    setBusy(true);
    try {
      const md = await build();
      if (how === "copy") {
        await navigator.clipboard.writeText(md);
        toast(`Copied ${issue.identifier} as Markdown.`);
      } else downloadText(`${issue.identifier}-${slug(issue.title)}.md`, md);
    } catch (e) {
      toast(`Couldn't export: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="px-btn small" disabled={busy} onClick={() => run("copy")} title="Copy the whole task as Markdown (details, documents, thread)">
        ⧉ Copy
      </button>
      <button className="px-btn small" disabled={busy} onClick={() => run("file")} title="Download the whole task as a Markdown file">
        ⬇ .md
      </button>
    </>
  );
}
