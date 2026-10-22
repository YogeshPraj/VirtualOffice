import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { brainApi } from "../api/brain";
import { keys } from "../api/hooks";
import { Markdown } from "../lib/markdown";
import { useOfficeLinks } from "../panels/TaskDocuments";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

export const ASK_EVENT = "pixel-office:ask";
export const askOffice = (question: string) => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }));

/** Turn bare task identifiers ("YOG-12") into office links, leaving existing links and code alone. */
export function linkIdentifiers(text: string, prefix: string): string {
  const re = new RegExp(`(\\[[^\\]]*\\]\\([^)]*\\)|\`[^\`]*\`)|\\b(${prefix}-\\d+)\\b`, "g");
  return text.replace(re, (m, skip: string | undefined, id: string | undefined) => (skip ? m : `[${id}](/${prefix}/issues/${id})`));
}

export interface Turn {
  q: string;
  a: string | null;
  error?: string;
  sources?: string[];
}

/** A task made from an answer: the question as its title, the answer as its details. */
export function taskFromTurn(t: Pick<Turn, "q" | "a">): { title: string; description: string } {
  const q = t.q.replace(/\?+\s*$/, "").trim();
  return {
    title: q.length > 90 ? `${q.slice(0, 88)}…` : q || "Follow up on the office's answer",
    description: `${t.a ?? ""}\n\n_From Ask the office: "${t.q}"_`,
  };
}

/** "Ask the office": a conversation with the office's AI (Claude Code or Copilot CLI) about the tasks, threads and the brain, with actions on each answer. */
export function AskOffice() {
  const { company, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const links = useOfficeLinks();
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: async ({ q, history }: { q: string; history: Turn[] }) => {
      const facts = await brainApi.ask(q).catch(() => []);
      const r = await fetch("/office-admin/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          question: q,
          facts: facts.slice(0, 12).map((f) => f.fact),
          history: history.filter((t) => t.a).map((t) => ({ q: t.q, a: t.a })),
        }),
      });
      const d = (await r.json()) as { answer?: string; sources?: string[]; error?: string };
      if (!r.ok || !d.answer) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d as { answer: string; sources: string[] };
    },
    onSuccess: (d) => setTurns((ts) => ts && ts.map((t, i) => (i === ts.length - 1 ? { ...t, a: d.answer, sources: d.sources } : t))),
    onError: (e: Error) => setTurns((ts) => ts && ts.map((t, i) => (i === ts.length - 1 ? { ...t, error: e.message } : t))),
  });
  const send = (q: string, history: Turn[]) => {
    const text = q.trim();
    if (!text || ask.isPending) return;
    setTurns([...history, { q: text, a: null }]);
    setDraft("");
    ask.mutate({ q: text, history });
  };

  useEffect(() => {
    const onAsk = (e: Event) => send((e as CustomEvent<string>).detail, []);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  });
  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would take for a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(() => {
    if (!turns) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTurns(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turns]);

  const makeTask = useMutation({
    mutationFn: (t: Turn) => api.createIssue(company.id, { ...taskFromTurn(t), status: "todo", assigneeAgentId: null }),
    onSuccess: (issue) => {
      toast(`Pinned ${issue.identifier}. Assign it in the task panel.`);
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
      setTurns(null);
      open({ kind: "issue", issueId: issue.id });
    },
    onError: (e: Error) => toast(e.message),
  });
  const remember = useMutation({
    mutationFn: (t: Turn) => brainApi.remember({ fact: `${t.a}`.slice(0, 1500), kind: "fact", provenance: `Ask the office: ${t.q}`.slice(0, 200) }),
    onSuccess: () => toast("Saved to the brain."),
    onError: (e: Error) => toast(`Couldn't reach the brain: ${e.message}`),
  });

  if (!turns) return null;
  return (
    <div className="palette-backdrop" onMouseDown={() => setTurns(null)}>
      <div className="palette ask-office" role="dialog" aria-label="Ask the office" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ margin: 0 }}>
          <h4 style={{ flex: 1, margin: 0 }}>🤖 ASK THE OFFICE</h4>
          <button className="px-btn small" onClick={() => setTurns(null)}>Close</button>
        </div>
        <div className="ask-thread" style={{ maxHeight: 440, overflow: "auto", margin: "6px 0" }}>
          {turns.map((t, i) => (
            <div key={i} className="ask-turn">
              <div style={{ fontSize: 17, margin: "6px 0 4px" }}>
                <b>You:</b> {t.q}
              </div>
              <div className="doc-view" style={{ minHeight: 40 }}>
                {!t.a && !t.error && <span className="muted">Reading the board, the threads and the brain… (up to a minute)</span>}
                {t.error && <span style={{ color: "var(--bad)" }}>{t.error}</span>}
                {t.a && <Markdown text={linkIdentifiers(t.a, company.issuePrefix)} links={{ ...links, issue: (id) => (setTurns(null), links.issue?.(id) ?? false) }} />}
              </div>
              {t.a && (
                <div className="row" style={{ margin: "4px 0 0", flexWrap: "wrap" }}>
                  <button className="px-btn small" disabled={makeTask.isPending} onClick={() => makeTask.mutate(t)} title="A new unassigned task from this answer">
                    📌 Make a task
                  </button>
                  <button className="px-btn small" disabled={remember.isPending} onClick={() => remember.mutate(t)} title="Keep this answer as a fact in the second brain">
                    🧠 Save to brain
                  </button>
                  <button className="px-btn small" onClick={() => void navigator.clipboard.writeText(t.a!).then(() => toast("Copied."))}>
                    ⧉ Copy
                  </button>
                  {t.sources?.length ? <span className="muted" style={{ fontSize: 14 }}>Looked closely at {t.sources.join(", ")}.</span> : null}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="row" style={{ margin: 0 }}>
          <input
            className="px-input"
            style={{ flex: 1, margin: 0 }}
            aria-label="Ask a follow-up"
            placeholder="Ask a follow-up… (Enter)"
            value={draft}
            disabled={ask.isPending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(draft, turns)}
            autoFocus
          />
          <button className="px-btn small primary" disabled={!draft.trim() || ask.isPending} onClick={() => send(draft, turns)}>
            Ask
          </button>
        </div>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Answered by the office's AI from its records (read-only; it can't change anything by itself).</div>
      </div>
    </div>
  );
}
