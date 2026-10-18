import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface WatchHit {
  url: string;
  key: string;
  title: string;
  type?: string;
  state?: string;
  assignee?: string;
}

export interface Watch {
  id: string;
  name: string;
  query: string;
  project: string;
  mine: boolean;
  everyMin: number;
  lastRunAt: string | null;
  lastError: string | null;
  lastFix: string | null;
  pending: WatchHit[];
}

export type WatchDef = Pick<Watch, "id" | "name" | "query" | "project" | "mine" | "everyMin">;

const KEY = ["watches"] as const;

async function call(method: string, path = "", body?: unknown): Promise<{ watches: Watch[] }> {
  const res = await fetch(`/office-admin/watches${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Watches failed (${res.status})`);
  return data as { watches: Watch[] };
}

export const useWatches = () => useQuery({ queryKey: KEY, queryFn: () => call("GET").then((d) => d.watches), refetchInterval: 60_000, retry: false });

export const toDef = (w: Watch | WatchDef): WatchDef => ({ id: w.id, name: w.name, query: w.query, project: w.project, mine: w.mine, everyMin: w.everyMin });

export function useWatchActions() {
  const qc = useQueryClient();
  const set = (d: { watches: Watch[] }) => qc.setQueryData(KEY, d.watches);
  return {
    save: useMutation({ mutationFn: (defs: WatchDef[]) => call("PUT", "", { watches: defs }), onSuccess: set }),
    run: useMutation({ mutationFn: (id: string) => call("POST", `/${encodeURIComponent(id)}/run`), onSuccess: set }),
    dismiss: useMutation({ mutationFn: ({ id, urls }: { id: string; urls: string[] }) => call("POST", `/${encodeURIComponent(id)}/dismiss`, { urls }), onSuccess: set }),
  };
}

export const pendingTotal = (list: Watch[] | undefined) => (list ?? []).reduce((n, w) => n + w.pending.length, 0);
