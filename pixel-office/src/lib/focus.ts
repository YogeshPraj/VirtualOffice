import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const MAX_FOCUS = 5;
const KEY = ["office-settings", "focus"] as const;

async function load(): Promise<string[]> {
  const res = await fetch("/office-admin/settings/focus");
  const data = res.ok ? ((await res.json()) as string[] | null) : null;
  return Array.isArray(data) ? data.filter((x) => typeof x === "string") : [];
}

/** Toggle a task in the focus list (newest pins go last; at most MAX_FOCUS). */
export function toggled(list: string[], id: string): string[] | null {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= MAX_FOCUS) return null;
  return [...list, id];
}

/** The CEO's pinned priorities, shared office-wide. */
export function useFocus() {
  const qc = useQueryClient();
  const { data: ids = [] } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const res = await fetch("/office-admin/settings/focus", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Couldn't save the focus list.");
      return next;
    },
    onMutate: (next) => qc.setQueryData(KEY, next),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  /** Returns false when the list is already full. */
  const toggle = (id: string) => {
    const next = toggled(ids, id);
    if (!next) return false;
    save.mutate(next);
    return true;
  };
  return { ids, toggle, set: (next: string[]) => save.mutate(next) };
}
