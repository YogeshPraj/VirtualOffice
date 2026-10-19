import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

export const DEFAULT_REPLIES = [
  "Go ahead.",
  "Looks good, ship it.",
  "Hold until I've reviewed it.",
  "Please add tests first.",
  "Split this into smaller tasks.",
  "Ask me before changing anything public.",
];

const KEY = ["office-settings", "replies"] as const;

async function load(): Promise<string[]> {
  const res = await fetch("/office-admin/settings/replies");
  const data = res.ok ? ((await res.json()) as string[] | null) : null;
  return Array.isArray(data) && data.length ? data.filter((x) => typeof x === "string") : DEFAULT_REPLIES;
}

/** One line per reply; blank lines dropped; at most 12, each at most 200 characters. */
export const parseReplies = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 12);

/** One-click answers. Picking one puts it in the box (appended if something's already typed). */
export function QuickReplies({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const { data: replies = DEFAULT_REPLIES } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 300_000 });
  const [editing, setEditing] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (list: string[]) => {
      const res = await fetch("/office-admin/settings/replies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) });
      if (!res.ok) throw new Error("Couldn't save the replies.");
      return list;
    },
    onSuccess: (list) => {
      qc.setQueryData(KEY, list);
      setEditing(null);
      toast("Quick replies saved.");
    },
    onError: (e: Error) => toast(e.message),
  });

  if (editing !== null) {
    return (
      <div className="quick-replies">
        <textarea className="px-textarea" aria-label="Quick replies, one per line" style={{ minHeight: 120, fontSize: 16 }} value={editing} onChange={(e) => setEditing(e.target.value)} />
        <div className="row">
          <button className="px-btn small primary" disabled={save.isPending} onClick={() => save.mutate(parseReplies(editing).length ? parseReplies(editing) : DEFAULT_REPLIES)}>
            Save
          </button>
          <button className="px-btn small" onClick={() => setEditing(null)}>Cancel</button>
          <span className="muted" style={{ fontSize: 14 }}>One reply per line.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="quick-replies row" role="group" aria-label="Quick replies">
      {replies.map((r) => (
        <button key={r} type="button" className="reply-chip" onClick={() => onChange(value.trim() ? `${value.trimEnd()} ${r}` : r)}>
          {r}
        </button>
      ))}
      <button type="button" className="reply-chip" aria-label="Edit quick replies" title="Edit quick replies" onClick={() => setEditing(replies.join("\n"))}>
        ✎
      </button>
    </div>
  );
}
