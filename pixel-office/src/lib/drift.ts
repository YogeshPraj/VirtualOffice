import { useQuery } from "@tanstack/react-query";
import type { Issue } from "../api/types";
import { extractSources } from "./links";

export interface SourceState {
  state: string | null;
  closed: boolean | null;
  checkedAt: string;
  changedAt: string | null;
  error: string | null;
}

export type Drift = { kind: "closed-at-source" | "open-at-source"; url: string; key: string; state: string; since: string | null };

export const useSources = () =>
  useQuery({
    queryKey: ["sources"],
    queryFn: async () => ((await (await fetch("/office-admin/sources")).json()) as { sources: Record<string, SourceState> }).sources,
    refetchInterval: 120_000,
    retry: false,
  });

/** Does the task disagree with the item it's about? */
export function driftFor(issue: Pick<Issue, "description" | "status">, sources: Record<string, SourceState> | undefined): Drift | null {
  if (!sources || issue.status === "cancelled") return null;
  for (const s of extractSources(issue.description)) {
    const st = sources[s.url];
    if (!st || st.closed === null || !st.state) continue;
    const taskDone = issue.status === "done";
    if (st.closed && !taskDone) return { kind: "closed-at-source", url: s.url, key: s.key, state: st.state, since: st.changedAt };
    if (!st.closed && taskDone) return { kind: "open-at-source", url: s.url, key: s.key, state: st.state, since: st.changedAt };
  }
  return null;
}
