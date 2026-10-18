import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, Issue } from "../api/types";

/** A saved blueprint for a kind of task. `assignee` is an agent id, a role ("qa"), or "lead". */
export interface TaskTemplate {
  id: string;
  icon: string;
  name: string;
  title: string; // may contain {what}
  description: string;
  priority: Issue["priority"];
  assignee: string;
}

export const DEFAULT_TEMPLATES: TaskTemplate[] = [
  {
    id: "bug",
    icon: "🐞",
    name: "Bug fix",
    title: "Fix: {what}",
    description:
      "## What's wrong\n{what}\n\n## Steps to reproduce\n1. \n\n## Expected\n\n## Done when\n- [ ] Root cause found and explained in the thread\n- [ ] Fix with a test that fails before and passes after\n- [ ] QA verifies",
    priority: "high",
    assignee: "lead",
  },
  {
    id: "review",
    icon: "🔍",
    name: "PR review",
    title: "Review: {what}",
    description:
      "Review the pull request linked below.\n\n## Look for\n- Correctness and edge cases\n- Tests that cover the change\n- Security and secrets\n- Anything that should be split out\n\nPost findings in the thread, most important first.",
    priority: "medium",
    assignee: "qa",
  },
  {
    id: "spike",
    icon: "🧪",
    name: "Spike",
    title: "Spike: {what}",
    description:
      "Time-boxed investigation (about half a day). Don't ship code.\n\n## Question\n{what}\n\n## Deliverable\nA short report document on this task: options, trade-offs, a recommendation and what it would take.",
    priority: "medium",
    assignee: "lead",
  },
  {
    id: "docs",
    icon: "📝",
    name: "Docs",
    title: "Docs: {what}",
    description: "Write or update documentation for: {what}\n\n## Done when\n- [ ] Accurate against the current code\n- [ ] Examples run as written\n- [ ] Linked from the README or index",
    priority: "low",
    assignee: "lead",
  },
  {
    id: "deps",
    icon: "📦",
    name: "Dependency update",
    title: "Update {what}",
    description: "Update {what} to the latest stable version.\n\n## Done when\n- [ ] Release notes read; breaking changes handled\n- [ ] Build and full test suite pass\n- [ ] Summary of what changed posted in the thread",
    priority: "low",
    assignee: "lead",
  },
];

export const fill = (text: string, what: string) => text.replace(/\{what\}/g, what.trim() || "…");

/** Who a template's `assignee` means in this company. */
export function resolveAssignee(t: TaskTemplate, agents: Agent[]): string | null {
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  if (!t.assignee) return null;
  const direct = staff.find((a) => a.id === t.assignee);
  if (direct) return direct.id;
  if (t.assignee === "lead") return (staff.find((a) => !a.reportsTo && ["general", "pm", "ceo", "cto"].includes(a.role)) ?? staff.find((a) => !a.reportsTo))?.id ?? null;
  return staff.find((a) => a.role === t.assignee)?.id ?? null;
}

const KEY = ["office-settings", "templates"] as const;

async function load(): Promise<TaskTemplate[]> {
  const res = await fetch("/office-admin/settings/templates");
  if (!res.ok) return DEFAULT_TEMPLATES;
  const data = (await res.json()) as TaskTemplate[] | null;
  return Array.isArray(data) ? data : DEFAULT_TEMPLATES;
}

export const useTemplates = () => useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });

export function useSaveTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (list: TaskTemplate[]) => {
      const res = await fetch("/office-admin/settings/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save templates");
      return list;
    },
    onSuccess: (list) => qc.setQueryData(KEY, list),
  });
}
