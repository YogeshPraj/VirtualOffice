import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { WorkProduct } from "../api/types";
import { useOfficeData } from "../state/officeData";

const TYPE_ICON: Record<WorkProduct["type"], string> = {
  pull_request: "🔀",
  branch: "🌿",
  commit: "◉",
  preview_url: "🌐",
  runtime_service: "⚙",
  artifact: "📦",
  document: "📄",
};

const STATUS_COLOR: Record<string, string> = {
  merged: "#9BE59B",
  approved: "#9BE59B",
  ready_for_review: "#C9A7FF",
  changes_requested: "#FF8A8A",
  failed: "#FF8A8A",
  closed: "#cfcfcf",
  archived: "#cfcfcf",
  draft: "#e0e0e0",
  active: "#8FD3FF",
};

/** Guess a work product from a pasted link (GitHub / Azure DevOps PRs, branches, commits). */
export function guessFromUrl(url: string): Pick<WorkProduct, "type" | "provider" | "title" | "externalId"> | null {
  let m = url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/);
  if (m) return { type: "pull_request", provider: "github", title: `${m[1]}#${m[2]}`, externalId: m[2] };
  m = url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/tree\/(.+)$/);
  if (m) return { type: "branch", provider: "github", title: `${m[1]}@${decodeURIComponent(m[2])}`, externalId: decodeURIComponent(m[2]) };
  m = url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/commit\/([0-9a-f]{7,40})/);
  if (m) return { type: "commit", provider: "github", title: `${m[1]}@${m[2].slice(0, 7)}`, externalId: m[2] };
  m = url.match(/^https:\/\/(?:dev\.azure\.com\/[^/]+|[^.]+\.visualstudio\.com)\/[^/]+\/_git\/([^/]+)\/pullrequest\/(\d+)/);
  if (m) return { type: "pull_request", provider: "azure_devops", title: `${m[1]} PR ${m[2]}`, externalId: m[2] };
  if (/^https?:\/\//.test(url)) return { type: "artifact", provider: "link", title: url.replace(/^https?:\/\//, "").slice(0, 80), externalId: null };
  return null;
}

/** PRs, branches, commits and previews employees produced for a task. */
export function WorkProducts({ issueId, projectId }: { issueId: string; projectId: string | null }) {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["work-products", issueId], queryFn: () => api.workProducts(issueId), refetchInterval: 60_000 });
  const [link, setLink] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["work-products", issueId] });
  const review = useMutation({
    mutationFn: ({ id, reviewState }: { id: string; reviewState: WorkProduct["reviewState"] }) => api.updateWorkProduct(id, { reviewState }),
    onSuccess: (_d, v) => {
      toast(v.reviewState === "approved" ? "Approved." : "Sent back with changes requested.");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });
  const add = useMutation({
    mutationFn: () => {
      const url = link.trim();
      const guess = guessFromUrl(url);
      if (!guess) throw new Error("Paste a full https:// link.");
      return api.addWorkProduct(issueId, { ...guess, url, projectId, status: guess.type === "pull_request" ? "ready_for_review" : "active" });
    },
    onSuccess: () => {
      setLink("");
      toast("Linked to the task.");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });

  const list = [...(data ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--good)" }}>
      <h4>🛠 WORK PRODUCTS {list.length > 0 && <span className="muted">{list.length}</span>}</h4>
      {list.length === 0 && <div className="muted">No PRs, branches or builds linked yet.</div>}
      {list.map((w) => {
        const meta = (w.metadata ?? {}) as { additions?: number; deletions?: number; changedFiles?: number };
        return (
          <div key={w.id} className="work-product">
            <div className="row" style={{ margin: 0, alignItems: "flex-start" }}>
              <span style={{ flex: 1 }}>
                {TYPE_ICON[w.type] ?? "•"} {w.isPrimary && "★ "}
                {w.url ? (
                  <a href={w.url} target="_blank" rel="noreferrer">
                    {w.title}
                  </a>
                ) : (
                  w.title
                )}
                <small className="muted" style={{ display: "block", fontSize: 15 }}>
                  {w.type.replace("_", " ")} · {w.provider}
                  {typeof meta.changedFiles === "number" && ` · ${meta.changedFiles} files`}
                  {typeof meta.additions === "number" && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--good)" }}>+{meta.additions}</span> <span style={{ color: "var(--bad)" }}>−{meta.deletions ?? 0}</span>
                    </>
                  )}
                </small>
              </span>
              <span className="tag" style={{ background: STATUS_COLOR[w.status] ?? "#eee", color: "var(--ink)" }}>
                {w.status.replace(/_/g, " ")}
              </span>
            </div>
            {w.summary && <div style={{ fontSize: 16, margin: "2px 0" }}>{w.summary}</div>}
            {w.reviewState === "needs_board_review" && (
              <div className="row" style={{ margin: "4px 0 0" }}>
                <span className="muted" style={{ flex: 1, fontSize: 15 }}>Waiting for your review.</span>
                <button className="px-btn small good" disabled={review.isPending} onClick={() => confirm(`Approve "${w.title}"?`) && review.mutate({ id: w.id, reviewState: "approved" })}>
                  ✔ Approve
                </button>
                <button className="px-btn small" disabled={review.isPending} onClick={() => confirm(`Request changes on "${w.title}"?`) && review.mutate({ id: w.id, reviewState: "changes_requested" })}>
                  ✎ Changes
                </button>
              </div>
            )}
            {w.reviewState === "approved" && <small style={{ color: "var(--good)" }}>✔ You approved this.</small>}
            {w.reviewState === "changes_requested" && <small style={{ color: "var(--bad)" }}>✎ Changes requested.</small>}
          </div>
        );
      })}
      <div className="row">
        <input
          className="px-input"
          style={{ flex: 1, margin: 0 }}
          aria-label="Link a PR, branch or build"
          placeholder="Link a PR, branch or build URL…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && link.trim() && add.mutate()}
        />
        <button className="px-btn small" disabled={!link.trim() || add.isPending} onClick={() => add.mutate()}>
          + Link
        </button>
      </div>
    </div>
  );
}
