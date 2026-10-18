// Team statistics shared by the employee scorecard and the reports.
import type { ActivityEntry, HeartbeatRun, Issue } from "../api/types";

/**
 * When work on each task first began: the earliest move to in progress (or check-out) in the activity
 * log. Paperclip's own startedAt is reset on every restart, so it understates long tasks.
 */
export function firstStarts(activity: ActivityEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of activity) {
    const to = ((a.details ?? {}) as { changes?: { status?: { to?: string } } }).changes?.status?.to;
    if (!((a.action === "issue.updated" && to === "in_progress") || a.action === "issue.checked_out")) continue;
    const t = Date.parse(a.createdAt);
    const prev = out.get(a.entityId);
    if (prev === undefined || t < prev) out.set(a.entityId, t);
  }
  return out;
}

/** Start-to-done time of a finished task (from when work first began, else start, else creation). */
export function cycleMs(i: Pick<Issue, "status" | "completedAt" | "startedAt" | "createdAt"> & { id?: string }, starts?: Map<string, number>): number | null {
  if (i.status !== "done" || !i.completedAt) return null;
  const first = i.id ? starts?.get(i.id) : undefined;
  const from = Math.min(first ?? Infinity, Date.parse(i.startedAt ?? i.createdAt));
  const ms = Date.parse(i.completedAt) - from;
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const fmtDuration = (ms: number | null) => {
  if (ms === null) return "–";
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 172_800_000) return `${(ms / 3_600_000).toFixed(ms < 36_000_000 ? 1 : 0)} h`;
  return `${(ms / 86_400_000).toFixed(1)} days`;
};

/** A review that sent work back: status left in_review for todo or in progress. */
export const isBounce = (a: ActivityEntry) => {
  const s = ((a.details ?? {}) as { changes?: { status?: { from?: string; to?: string } } }).changes?.status;
  return a.action === "issue.updated" && s?.from === "in_review" && (s.to === "todo" || s.to === "in_progress");
};

export interface Scorecard {
  done: number;
  medianCycleMs: number | null;
  shifts: number;
  failedShifts: number;
  failureRate: number | null;
  bounces: number;
  open: number;
}

export function scorecard(agentId: string, issues: Issue[], runs: HeartbeatRun[], activity: ActivityEntry[], since: number): Scorecard {
  const mine = issues.filter((i) => i.assigneeAgentId === agentId && i.workMode !== "ask");
  const finished = mine.filter((i) => i.status === "done" && i.completedAt && Date.parse(i.completedAt) >= since);
  const shifts = runs.filter((r) => r.agentId === agentId && r.startedAt && Date.parse(r.startedAt) >= since);
  const failed = shifts.filter((r) => (r.status === "failed" || r.status === "timed_out") && !/blocked by unresolved blockers/i.test(r.error ?? ""));
  const mineIds = new Set(mine.map((i) => i.id));
  const starts = firstStarts(activity);
  return {
    done: finished.length,
    medianCycleMs: median(finished.map((i) => cycleMs(i, starts)).filter((x): x is number => x !== null)),
    shifts: shifts.length,
    failedShifts: failed.length,
    failureRate: shifts.length ? failed.length / shifts.length : null,
    bounces: activity.filter((a) => mineIds.has(a.entityId) && Date.parse(a.createdAt) >= since && isBounce(a)).length,
    open: mine.filter((i) => ["todo", "in_progress", "in_review", "blocked"].includes(i.status)).length,
  };
}

/** Cycle-time summary of tasks finished in [from, to). */
export function cycleSummary(issues: Issue[], from: number, to: number, activity: ActivityEntry[] = []) {
  const starts = firstStarts(activity);
  const done = issues
    .filter((i) => i.workMode !== "ask" && i.status === "done" && i.completedAt && Date.parse(i.completedAt) >= from && Date.parse(i.completedAt) < to)
    .map((i) => ({ issue: i, ms: cycleMs(i, starts) }))
    .filter((x): x is { issue: Issue; ms: number } => x.ms !== null);
  return {
    count: done.length,
    medianMs: median(done.map((d) => d.ms)),
    slowest: [...done].sort((a, b) => b.ms - a.ms).slice(0, 3),
  };
}
