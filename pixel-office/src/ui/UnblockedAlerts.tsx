import { useEffect, useRef } from "react";
import type { Issue, IssueRef } from "../api/types";
import { api } from "../api/client";
import { useOffice } from "../state/officeStore";
import { useOfficeData } from "../state/officeData";
import { notifyCeo } from "./useNotifications";

const CLOSED = new Set(["done", "cancelled"]);

/** Tasks that became done since the last look (not ones already done when the office opened). */
export function newlyDone(prev: Map<string, string> | null, issues: Pick<Issue, "id" | "status">[]): string[] {
  if (!prev) return [];
  return issues.filter((i) => i.status === "done" && prev.has(i.id) && prev.get(i.id) !== "done").map((i) => i.id);
}

/** Of the tasks `done` was blocking, those with no open blocker left. */
export function freed(blocks: IssueRef[], openBlockers: Record<string, number>): IssueRef[] {
  return blocks.filter((b) => !CLOSED.has(b.status) && (openBlockers[b.id] ?? 0) === 0);
}

/** When a blocking task is done, say which tasks it freed up. */
export function UnblockedAlerts() {
  const { issues, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const ids = newlyDone(seen.current, issues);
    seen.current = new Map(issues.map((i) => [i.id, i.status]));
    for (const id of ids) {
      void (async () => {
        const done = await api.issue(id).catch(() => null);
        const blocks = done?.blocks ?? [];
        if (!done || !blocks.length) return;
        const counts: Record<string, number> = {};
        await Promise.all(
          blocks.map(async (b) => {
            const r = await api.issueBlockers(b.id).catch(() => null);
            counts[b.id] = r ? r.blockers.filter((x) => !CLOSED.has(x.status) && x.id !== id).length : 1;
          }),
        );
        const list = freed(blocks, counts);
        if (!list.length) return;
        const names = list.map((b) => `${b.identifier}${b.assigneeAgentId ? ` (${agentById(b.assigneeAgentId)?.name ?? "someone"})` : " (unassigned)"}`);
        toast(`🔓 ${done.identifier} is done: ${names.join(", ")} can go ahead now.`);
        notifyCeo(`🔓 ${done.identifier} unblocked ${list.length} task${list.length === 1 ? "" : "s"}`, list.map((b) => `${b.identifier} ${b.title}`).join("\n"), () => open({ kind: "issue", issueId: list[0].id }), `unblocked-${id}`);
      })();
    }
  }, [issues, agentById, toast, open]);
  return null;
}
