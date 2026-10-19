import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** issueId -> due date (YYYY-MM-DD, local calendar day). Paperclip has no due date, so the office keeps them. */
export type DueMap = Record<string, string>;
export type DueState = "overdue" | "today" | "soon" | "later";

const KEY = ["office-settings", "due"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Whole days from today to the due date (negative = overdue). */
export function daysUntil(due: string, now = new Date()): number {
  const [y, m, d] = due.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function dueState(due: string, now = new Date()): DueState {
  const n = daysUntil(due, now);
  return n < 0 ? "overdue" : n === 0 ? "today" : n <= 2 ? "soon" : "later";
}

export function dueLabel(due: string, now = new Date()): string {
  const n = daysUntil(due, now);
  if (n < -1) return `${-n} days overdue`;
  if (n === -1) return "due yesterday";
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  if (n < 7) return `due ${new Date(due + "T12:00:00").toLocaleDateString([], { weekday: "short" })}`;
  return `due ${new Date(due + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}`;
}

export const DUE_ICON: Record<DueState, string> = { overdue: "🔥", today: "⏰", soon: "⏳", later: "📅" };

async function load(): Promise<DueMap> {
  const res = await fetch("/office-admin/settings/due");
  const data = res.ok ? ((await res.json()) as DueMap | null) : null;
  return data && typeof data === "object" ? Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string" && DATE.test(v))) : {};
}

export function useDue() {
  const qc = useQueryClient();
  const { data: due = {} } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (next: DueMap) => {
      const res = await fetch("/office-admin/settings/due", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Couldn't save the due date.");
      return next;
    },
    onMutate: (next) => qc.setQueryData(KEY, next),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  /** Set or clear (null) due dates for several tasks at once, from the latest saved map. */
  const setMany = async (changes: Record<string, string | null>) => {
    const current = (qc.getQueryData<DueMap>(KEY) ?? (await load())) as DueMap;
    const next = { ...current };
    for (const [id, d] of Object.entries(changes)) {
      if (d && DATE.test(d)) next[id] = d;
      else delete next[id];
    }
    await save.mutateAsync(next);
  };
  return { due, set: (id: string, d: string | null) => setMany({ [id]: d }), setMany };
}
