import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** issueId -> the one comment pinned to the top of its thread. Paperclip has no pins, so the office keeps them. */
export type PinMap = Record<string, string>;

const KEY = ["office-settings", "pins"] as const;

/** Pin `commentId` on the task, or unpin it if it's already the pinned one. */
export function togglePin(pins: PinMap, issueId: string, commentId: string): PinMap {
  const next = { ...pins };
  if (next[issueId] === commentId) delete next[issueId];
  else next[issueId] = commentId;
  return next;
}

async function load(): Promise<PinMap> {
  const res = await fetch("/office-admin/settings/pins");
  const data = res.ok ? ((await res.json()) as PinMap | null) : null;
  return data && typeof data === "object" ? Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string")) : {};
}

export function usePins() {
  const qc = useQueryClient();
  const { data: pins = {} } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (next: PinMap) => {
      const res = await fetch("/office-admin/settings/pins", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Couldn't save the pin.");
      return next;
    },
    onMutate: (next) => qc.setQueryData(KEY, next),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const toggle = async (issueId: string, commentId: string) => {
    const current = qc.getQueryData<PinMap>(KEY) ?? (await load());
    await save.mutateAsync(togglePin(current, issueId, commentId));
  };
  return { pins, toggle };
}
