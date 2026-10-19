import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { brainApi } from "../api/brain";
import { Markdown } from "../lib/markdown";
import { useOfficeLinks } from "../panels/TaskDocuments";
import { useOfficeData } from "../state/officeData";

export const ASK_EVENT = "pixel-office:ask";
export const askOffice = (question: string) => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }));

/** Turn bare task identifiers ("YOG-12") into office links, leaving existing links and code alone. */
export function linkIdentifiers(text: string, prefix: string): string {
  const re = new RegExp(`(\\[[^\\]]*\\]\\([^)]*\\)|\`[^\`]*\`)|\\b(${prefix}-\\d+)\\b`, "g");
  return text.replace(re, (m, skip: string | undefined, id: string | undefined) => (skip ? m : `[${id}](/${prefix}/issues/${id})`));
}

/** "Ask the office": a question answered by Claude from the tasks, threads and the brain. */
export function AskOffice() {
  const { company } = useOfficeData();
  const links = useOfficeLinks();
  const [question, setQuestion] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: async (q: string) => {
      const facts = await brainApi.ask(q).catch(() => []);
      const r = await fetch("/office-admin/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, question: q, facts: facts.slice(0, 12).map((f) => f.fact) }),
      });
      const d = (await r.json()) as { answer?: string; sources?: string[]; error?: string };
      if (!r.ok || !d.answer) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d as { answer: string; sources: string[] };
    },
  });

  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail.trim();
      if (!q) return;
      setQuestion(q);
      ask.mutate(q);
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [ask]);

  useEffect(() => {
    if (!question) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQuestion(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question]);

  if (!question) return null;
  return (
    <div className="palette-backdrop" onMouseDown={() => setQuestion(null)}>
      <div className="palette ask-office" role="dialog" aria-label="Ask the office" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ margin: 0 }}>
          <h4 style={{ flex: 1, margin: 0 }}>🤖 ASK THE OFFICE</h4>
          <button className="px-btn small" onClick={() => setQuestion(null)}>Close</button>
        </div>
        <div style={{ fontSize: 17, margin: "6px 0" }}>
          <b>You:</b> {question}
        </div>
        <div className="doc-view" style={{ maxHeight: 420, minHeight: 80 }}>
          {ask.isPending && <span className="muted">Reading the board, the threads and the brain… (up to a minute)</span>}
          {ask.error && <span style={{ color: "var(--bad)" }}>{(ask.error as Error).message}</span>}
          {ask.data && <Markdown text={linkIdentifiers(ask.data.answer, company.issuePrefix)} links={{ ...links, issue: (id) => (setQuestion(null), links.issue?.(id) ?? false) }} />}
        </div>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Answered by Claude from the office's records (read-only; it can't change anything).
          {ask.data?.sources.length ? ` Looked closely at ${ask.data.sources.join(", ")}.` : ""}
        </div>
      </div>
    </div>
  );
}
