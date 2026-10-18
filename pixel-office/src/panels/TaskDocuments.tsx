import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { IssueDocument } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Markdown, type MdLinks } from "../lib/markdown";

const DOC_ICON: Record<string, string> = { plan: "🗺", spec: "📐", report: "📋", design: "🎨", notes: "📝" };

/** Links inside agent-written text: tasks and employees open in the office. */
export function useOfficeLinks(): MdLinks {
  const { issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  return {
    issue: (identifier) => {
      const hit = issues.find((i) => i.identifier === identifier);
      if (hit) open({ kind: "issue", issueId: hit.id });
      return !!hit;
    },
    agent: (agentId) => open({ kind: "agent", agentId }),
  };
}

/** The plans, specs and reports employees attach to a task, with their revision history. */
export function TaskDocuments({ issueId }: { issueId: string }) {
  const { data: docs } = useQuery({ queryKey: ["documents", issueId], queryFn: () => api.issueDocuments(issueId), refetchInterval: 60_000 });
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!docs?.length) return null;
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--accent, #c9a7ff)" }}>
      <h4>📎 DOCUMENTS</h4>
      {docs.map((d) => (
        <div key={d.id}>
          <button className="rpg-option" style={{ color: "var(--ink)" }} aria-expanded={openKey === d.key} onClick={() => setOpenKey(openKey === d.key ? null : d.key)}>
            {DOC_ICON[d.key] ?? "📄"} {d.title || d.key}
            <small style={{ color: "var(--muted)" }}>
              {d.key} · v{d.latestRevisionNumber} · {new Date(d.updatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
              {d.lockedAt ? " · 🔒 locked" : ""}
            </small>
          </button>
          {openKey === d.key && <DocumentView issueId={issueId} doc={d} />}
        </div>
      ))}
    </div>
  );
}

function DocumentView({ issueId, doc }: { issueId: string; doc: IssueDocument }) {
  const { agentById, toast } = useOfficeData();
  const links = useOfficeLinks();
  const qc = useQueryClient();
  const [revisionId, setRevisionId] = useState<string>("");
  const { data: revisions } = useQuery({
    queryKey: ["document-revisions", issueId, doc.key, doc.latestRevisionId],
    queryFn: () => api.documentRevisions(issueId, doc.key),
    enabled: doc.latestRevisionNumber > 1,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api.restoreRevision(issueId, doc.key, id),
    onSuccess: () => {
      toast(`Restored an earlier version of ${doc.title || doc.key}.`);
      setRevisionId("");
      qc.invalidateQueries({ queryKey: ["documents", issueId] });
    },
    onError: (e: Error) => toast(e.message),
  });
  const rev = revisions?.find((r) => r.id === revisionId);
  const body = rev?.body ?? doc.body;
  const author = (agentId: string | null, userId?: string | null) => agentById(agentId)?.name ?? (userId ? "you" : "someone");

  return (
    <div className="doc-view">
      <div className="row" style={{ fontSize: 16, margin: "4px 0" }}>
        <span className="muted" style={{ flex: 1 }}>
          {rev ? `Version ${rev.revisionNumber} by ${author(rev.createdByAgentId, rev.createdByUserId)}` : `Latest, by ${author(doc.updatedByAgentId, doc.updatedByUserId)}`}
        </span>
        {revisions && revisions.length > 1 && (
          <select className="px-select" style={{ width: "auto", margin: 0, fontSize: 16 }} aria-label="Version" value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
            <option value="">Latest (v{doc.latestRevisionNumber})</option>
            {revisions
              .filter((r) => r.id !== doc.latestRevisionId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.revisionNumber} · {new Date(r.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  {r.changeSummary ? ` · ${r.changeSummary}` : ""}
                </option>
              ))}
          </select>
        )}
        <button className="px-btn small" title="Copy as Markdown" onClick={() => navigator.clipboard?.writeText(body).then(() => toast("Copied."))}>
          ⧉
        </button>
      </div>
      {rev && (
        <div className="row" style={{ fontSize: 16 }}>
          <span className="muted" style={{ flex: 1 }}>You're reading an older version.</span>
          <button
            className="px-btn small"
            disabled={restore.isPending}
            onClick={() => confirm(`Make version ${rev.revisionNumber} the current ${doc.title || doc.key}? The latest version stays in the history.`) && restore.mutate(rev.id)}
          >
            ↺ Restore this version
          </button>
        </div>
      )}
      {doc.format === "markdown" ? <Markdown text={body} links={links} /> : <pre style={{ whiteSpace: "pre-wrap" }}>{body}</pre>}
    </div>
  );
}
