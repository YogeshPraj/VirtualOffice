import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttentionItem } from "../api/types";

/** attention key ("sourceKind:subjectId") -> ISO time it comes back. Shared office-wide. */
export type SnoozeMap = Record<string, string>;

const KEY = ["office-settings", "snooze"] as const;
export const attentionKey = (a: Pick<AttentionItem, "sourceKind"> & { subject: { id: string } }) => `${a.sourceKind}:${a.subject.id}`;

export type SnoozeFor = "later" | "tomorrow" | "monday";

/** When a snooze ends: in 3 hours, tomorrow 9:00, or next Monday 9:00 (local time). */
export function snoozeUntil(kind: SnoozeFor, now = new Date()): Date {
  if (kind === "later") return new Date(now.getTime() + 3 * 3_600_000);
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (kind === "tomorrow") d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); // the coming Monday, never today
  return d;
}

/** Items still asleep at `now`, and the ones that should be shown. */
export function splitSnoozed<T extends Pick<AttentionItem, "sourceKind"> & { subject: { id: string } }>(items: T[], snooze: SnoozeMap, now = Date.now()) {
  const asleep = items.filter((a) => snooze[attentionKey(a)] && Date.parse(snooze[attentionKey(a)]) > now);
  const awake = items.filter((a) => !asleep.includes(a));
  return { asleep, awake };
}

async function load(): Promise<SnoozeMap> {
  const res = await fetch("/office-admin/settings/snooze");
  const data = res.ok ? ((await res.json()) as SnoozeMap | null) : null;
  return data && typeof data === "object" ? data : {};
}

export function useSnooze() {
  const qc = useQueryClient();
  const { data: snooze = {} } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (next: SnoozeMap) => {
      const res = await fetch("/office-admin/settings/snooze", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Couldn't snooze.");
      return next;
    },
    onMutate: (next) => qc.setQueryData(KEY, next),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  // Re-render when a snooze ends, so the item comes back by itself.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const prune = (m: SnoozeMap) => Object.fromEntries(Object.entries(m).filter(([, until]) => Date.parse(until) > Date.now()));
  return {
    snooze,
    put: (key: string, until: Date) => save.mutate({ ...prune(snooze), [key]: until.toISOString() }),
    wake: (key: string) => {
      const next = prune(snooze);
      delete next[key];
      save.mutate(next);
    },
  };
}
