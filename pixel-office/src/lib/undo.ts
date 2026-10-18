import type { Issue } from "../api/types";

type Change = Partial<Pick<Issue, "status" | "assigneeAgentId" | "priority" | "projectId" | "parentId" | "goalId" | "title">>;

/** The change that puts a task back the way it was before `change`. */
export function inverseOf(before: Partial<Issue>, change: Change): Change {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(change) as (keyof Change)[]) {
    if (before[k] !== undefined && before[k] !== change[k]) out[k] = before[k] ?? null;
  }
  return out as Change;
}

export const isEmpty = (c: Change) => Object.keys(c).length === 0;

/** Short words for what a change did, for the toast ("moved to done", "reassigned"). */
export function describeChange(change: Change, agentName: (id: string | null | undefined) => string | undefined): string {
  if (change.status) return `moved to ${change.status.replace("_", " ")}`;
  if ("assigneeAgentId" in change) return change.assigneeAgentId ? `assigned to ${agentName(change.assigneeAgentId) ?? "someone"}` : "unassigned";
  if (change.priority) return `priority ${change.priority}`;
  if ("goalId" in change) return "goal changed";
  if ("projectId" in change) return "project changed";
  if ("parentId" in change) return "moved under another task";
  return "updated";
}
