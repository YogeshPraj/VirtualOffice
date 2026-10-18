// Client for the second brain, via the pixel office's own server-side bridge (/brain/*).
import { useQuery } from "@tanstack/react-query";

export type MemoryKind = "preference" | "commitment" | "fact" | "event" | "idea" | "belief";

export interface Memory {
  id: number | string;
  fact: string;
  kind: MemoryKind;
  entity_slug: string | null;
  source: string | null;
  created_at: string;
  valid_until?: string | null;
  expired_at?: string | null;
}

async function brain<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/brain${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Brain request failed (${res.status})`);
  return data as T;
}

const facts = (r: { facts?: Memory[] } | null) => r?.facts ?? [];

export const brainApi = {
  status: () => brain<{ ok: boolean; version?: string; engine?: string }>("GET", "/status"),
  recent: (days = 90) => brain<{ facts?: Memory[] }>("GET", `/recent?days=${days}`).then(facts),
  ask: (q: string) => brain<{ facts?: Memory[] }>("GET", `/ask?q=${encodeURIComponent(q)}`).then(facts),
  remember: (body: { fact: string; kind: MemoryKind; entity?: string; provenance?: string; origin?: "decision" }) =>
    brain<{ status?: string; id?: string }>("POST", "/remember", body),
  forget: (id: Memory["id"]) => brain("POST", "/forget", { id }),
};

export const brainKeys = { recent: ["brain", "recent"] as const, status: ["brain", "status"] as const };

export const useBrainStatus = () =>
  useQuery({ queryKey: brainKeys.status, queryFn: brainApi.status, refetchInterval: 30_000, retry: false });

export const useRecentMemories = () => useQuery({ queryKey: brainKeys.recent, queryFn: () => brainApi.recent(), retry: false });

/**
 * Record a CEO decision so every employee can recall it later. Best effort: a decision must
 * never fail because the brain is down, so errors are only logged.
 */
export function logDecision(text: string, entity: string, provenance: string) {
  brainApi
    .remember({ fact: text.slice(0, 3800), kind: "commitment", entity, provenance, origin: "decision" })
    .catch((e) => console.warn("[brain] decision not recorded:", (e as Error).message));
}
