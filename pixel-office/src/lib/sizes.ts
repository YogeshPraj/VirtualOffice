import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Size = "S" | "M" | "L";
export const SIZES: Size[] = ["S", "M", "L"];
export const SIZE_LABEL: Record<Size, string> = { S: "Small (an hour or so)", M: "Medium (half a day)", L: "Large (a day or more)" };

/** issueId -> the CEO's size guess. Paperclip has no sizes, so the office keeps them. */
export type SizeMap = Record<string, Size>;
const KEY = ["office-settings", "sizes"] as const;

async function load(): Promise<SizeMap> {
  const res = await fetch("/office-admin/settings/sizes");
  const data = res.ok ? ((await res.json()) as Record<string, unknown> | null) : null;
  return data && typeof data === "object" ? (Object.fromEntries(Object.entries(data).filter(([, v]) => SIZES.includes(v as Size))) as SizeMap) : {};
}

export function useSizes() {
  const qc = useQueryClient();
  const { data: sizes = {} } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (next: SizeMap) => {
      const res = await fetch("/office-admin/settings/sizes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Couldn't save the size.");
      return next;
    },
    onMutate: (next) => qc.setQueryData(KEY, next),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const set = async (issueId: string, size: Size | null) => {
    const next = { ...(qc.getQueryData<SizeMap>(KEY) ?? (await load())) };
    if (size) next[issueId] = size;
    else delete next[issueId];
    await save.mutateAsync(next);
  };
  return { sizes, set };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Per size: how many and the median time worked; plus tasks that took longer than the next size up usually does. */
export function sizeStats(rows: { identifier: string; title: string; id: string; size: Size; ms: number }[]) {
  const by = Object.fromEntries(SIZES.map((s) => [s, rows.filter((r) => r.size === s)])) as Record<Size, typeof rows>;
  const stats = SIZES.map((s) => ({ size: s, count: by[s].length, median: median(by[s].map((r) => r.ms)) }));
  const next: Partial<Record<Size, Size>> = { S: "M", M: "L" };
  const longer = rows.filter((r) => {
    const up = next[r.size];
    const ref = up ? stats.find((x) => x.size === up)! : null;
    return ref && ref.count > 0 && r.ms > ref.median;
  });
  return { stats, longer };
}
