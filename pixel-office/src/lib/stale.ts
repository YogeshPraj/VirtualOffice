import type { Issue } from "../api/types";

export const STALE_DAYS = 7;
const OPEN = new Set(["todo", "in_progress", "in_review", "blocked"]);

/** Whole days since anyone touched an open task, or null if it isn't stale (or isn't open). */
export function staleDays(issue: Pick<Issue, "status" | "updatedAt" | "lastActivityAt">, now = Date.now(), days = STALE_DAYS): number | null {
  if (!OPEN.has(issue.status)) return null;
  const at = Date.parse(issue.lastActivityAt ?? issue.updatedAt);
  if (Number.isNaN(at)) return null;
  const d = Math.floor((now - at) / 86_400_000);
  return d >= days ? d : null;
}
