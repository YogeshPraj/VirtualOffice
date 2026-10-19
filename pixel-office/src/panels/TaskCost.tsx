import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CostSummary } from "../api/types";


const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** "4 shifts · 21 min of work · $0.12 · 80k tokens", or null before the first shift. */
export function costLine(s: CostSummary | undefined): string | null {
  if (!s || s.runCount === 0) return null;
  const parts = [`${s.runCount} shift${s.runCount === 1 ? "" : "s"}`, `${duration(s.runtimeMs)} of work`];
  parts.push(s.costCents > 0 ? `$${(s.costCents / 100).toFixed(2)}` : "no metered cost (subscription)");
  const t = s.inputTokens + s.cachedInputTokens + s.outputTokens;
  if (t > 0) parts.push(`${tokens(t)} tokens`);
  if (s.issueCount > 1) parts.push(`incl. ${s.issueCount - 1} sub-task${s.issueCount === 2 ? "" : "s"}`);
  return parts.join(" · ");
}

/** What the task's shifts have cost so far (sub-tasks included). */
export function TaskCost({ issueId, updatedAt }: { issueId: string; updatedAt: string }) {
  const { data } = useQuery({
    queryKey: ["issue-cost", issueId, updatedAt],
    queryFn: () => api.issueCost(issueId),
    staleTime: 60_000,
  });
  const line = costLine(data);
  if (!line) return null;
  return (
    <div className="muted task-cost" style={{ fontSize: 15, margin: "2px 0 6px" }} title="Paperclip's totals for this task and its sub-tasks">
      ⏱ {line}
    </div>
  );
}
