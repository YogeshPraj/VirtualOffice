import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useComments } from "../api/hooks";
import type { Agent, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Markdown } from "../lib/markdown";
import { useOfficeLinks } from "./TaskDocuments";

/** Questions are Paperclip tasks in "ask" mode: the employee answers in the thread, no code, no plan. */
export const isQuestion = (i: Issue) => i.workMode === "ask";

/** Ask an employee something quick, and read their answers, from their panel. */
export function AskEmployee({ agent }: { agent: Agent }) {
  const { company, issues, toast } = useOfficeData();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const asked = issues
    .filter((i) => isQuestion(i) && i.assigneeAgentId === agent.id && i.status !== "cancelled")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const ask = useMutation({
    mutationFn: () => {
      const q = text.trim();
      const title = q.length > 80 ? `${q.slice(0, 77).trimEnd()}…` : q;
      return api.createIssue(company.id, {
        title: `Question: ${title}`,
        description: `${q}\n\n_Asked by the CEO from ${agent.name}'s desk. Answer in the thread; this is a question, not a work task._`,
        assigneeAgentId: agent.id,
        status: "todo",
        priority: "medium",
        workMode: "ask",
      });
    },
    onSuccess: () => {
      setText("");
      toast(`Asked ${agent.name}. The answer will appear here.`);
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  const unavailable = agent.status === "terminated" || agent.status === "pending_approval";
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }}>
      <h4>💬 ASK {agent.name.toUpperCase()}</h4>
      <textarea
        className="px-textarea"
        aria-label={`Ask ${agent.name} a question`}
        style={{ minHeight: 60 }}
        placeholder={`e.g. Where is retry logic handled in the router? What would it take to add caching?`}
        value={text}
        disabled={unavailable}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim() && ask.mutate()}
      />
      <div className="row">
        <span className="muted" style={{ flex: 1, fontSize: 15 }}>
          {agent.status === "paused" ? "They're paused, so they'll answer once resumed." : "They answer in a thread; nothing gets built."}
        </span>
        <button className="px-btn small primary" disabled={!text.trim() || ask.isPending || unavailable} onClick={() => ask.mutate()}>
          {ask.isPending ? "Asking…" : "Ask"}
        </button>
      </div>
      {asked.map((q) => (
        <QuestionThread key={q.id} question={q} agent={agent} />
      ))}
    </div>
  );
}

function QuestionThread({ question, agent }: { question: Issue; agent: Agent }) {
  const { company, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const links = useOfficeLinks();
  const qc = useQueryClient();
  const comments = useComments(question.id);
  const done = question.status === "done";
  // The answer arrives as a comment: refresh when the question moves, and poll while it's open.
  useEffect(() => {
    comments.refetch();
  }, [question.updatedAt, question.status]);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => comments.refetch(), 15_000);
    return () => clearInterval(t);
  }, [done]);
  const answers = (comments.data ?? []).filter((c) => c.authorAgentId === agent.id);
  const last = answers[answers.length - 1];
  const close = useMutation({
    mutationFn: () => api.updateIssue(question.id, { status: "done" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.issues(company.id) }),
    onError: (e: Error) => toast(e.message),
  });
  return (
    <div className="question">
      <div className="row" style={{ margin: 0 }}>
        <b style={{ flex: 1, fontSize: 17 }}>{question.title.replace(/^Question:\s*/, "")}</b>
        <small className="muted">{done ? "answered" : last ? "replied" : question.status === "in_progress" ? "thinking…" : "waiting"}</small>
      </div>
      {last ? (
        <div className="answer">
          <Markdown text={last.body.length > 1500 ? `${last.body.slice(0, 1500)}…` : last.body} links={links} />
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 16 }}>No answer yet.</div>
      )}
      <div className="row" style={{ margin: "2px 0 0" }}>
        <button className="px-btn small" onClick={() => open({ kind: "issue", issueId: question.id })}>
          Open thread{answers.length > 1 ? ` (${answers.length} replies)` : ""}
        </button>
        {!done && last && (
          <button className="px-btn small good" disabled={close.isPending} onClick={() => close.mutate()}>
            ✔ Thanks, that answers it
          </button>
        )}
      </div>
    </div>
  );
}
