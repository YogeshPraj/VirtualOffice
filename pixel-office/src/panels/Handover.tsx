import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "../api/types";
import { Markdown } from "../lib/markdown";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

interface Note {
  issueId: string;
  identifier: string;
  title: string;
  body: string;
}

/** Draft handover notes for someone's open tasks, preview them, then save one on each task. */
export function Handover({ agent }: { agent: Agent }) {
  const { company, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const draft = useMutation({
    mutationFn: async () => {
      const r = await fetch("/office-admin/handover/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, agentId: agent.id }) });
      const d = (await r.json()) as { notes?: Note[]; error?: string };
      if (!r.ok || !d.notes) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d.notes;
    },
    onError: (e: Error) => toast(e.message),
  });
  const save = useMutation({
    mutationFn: async (notes: Note[]) => {
      const r = await fetch("/office-admin/handover/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notes.map((n) => ({ issueId: n.issueId, body: n.body })) }) });
      const d = (await r.json()) as { saved?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d.saved ?? 0;
    },
    onSuccess: (n, notes) => {
      toast(`Saved ${n} handover note${n === 1 ? "" : "s"}; each task has a "Handover" document now.`);
      for (const note of notes) qc.invalidateQueries({ queryKey: ["documents", note.issueId] });
      draft.reset();
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!draft.data)
    return (
      <button className="px-btn small" disabled={draft.isPending} onClick={() => draft.mutate()} title="Claude reads each open task and its thread (read-only)">
        {draft.isPending ? "Drafting… (up to a minute)" : "📝 Draft handover notes"}
      </button>
    );
  if (!draft.data.length) return <div className="muted">No open tasks to hand over.</div>;
  return (
    <div className="handover" aria-label="Handover notes">
      <div style={{ fontSize: 16, margin: "6px 0" }}>Drafts for {draft.data.length} task{draft.data.length === 1 ? "" : "s"}. Read them, then save one on each task:</div>
      {draft.data.map((n) => (
        <div key={n.issueId} className="doc-view" style={{ marginBottom: 6 }}>
          <button className="link-btn" onClick={() => open({ kind: "issue", issueId: n.issueId })}>
            {n.identifier} {n.title}
          </button>
          <Markdown text={n.body} />
        </div>
      ))}
      <div className="row">
        <button className="px-btn small primary" disabled={save.isPending} onClick={() => save.mutate(draft.data!)}>
          💾 Save on each task
        </button>
        <button className="px-btn small" onClick={() => draft.reset()}>Discard</button>
      </div>
    </div>
  );
}
