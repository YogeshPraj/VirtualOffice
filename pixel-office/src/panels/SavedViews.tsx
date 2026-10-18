import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardFilter } from "./MeetingPanel";
import { useOfficeData } from "../state/officeData";

export interface SavedView {
  id: string;
  name: string;
  filter: BoardFilter;
  questions?: boolean;
}

const KEY = ["office-settings", "views"] as const;

async function load(): Promise<SavedView[]> {
  const res = await fetch("/office-admin/settings/views");
  const data = res.ok ? ((await res.json()) as SavedView[] | null) : null;
  return Array.isArray(data) ? data : [];
}

export const sameFilter = (a: BoardFilter, b: BoardFilter) => a.q === b.q && a.agent === b.agent && a.project === b.project && a.priority === b.priority;

/** Named board filters, shared office-wide (kept in .office/ and backed up with the company). */
export function SavedViews({ filter, questions, onApply }: { filter: BoardFilter; questions: boolean; onApply: (v: SavedView) => void }) {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const { data: views = [] } = useQuery({ queryKey: KEY, queryFn: load, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: async (list: SavedView[]) => {
      const res = await fetch("/office-admin/settings/views", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) });
      if (!res.ok) throw new Error("Couldn't save the view.");
      return list;
    },
    onSuccess: (list) => qc.setQueryData(KEY, list),
    onError: (e: Error) => toast(e.message),
  });

  const filtered = Object.values(filter).some(Boolean) || questions;
  const current = views.find((v) => sameFilter(v.filter, filter) && !!v.questions === questions);

  return (
    <div className="row saved-views" role="toolbar" aria-label="Saved views">
      {views.map((v) => (
        <span key={v.id} className={`view-chip ${current?.id === v.id ? "on" : ""}`}>
          <button onClick={() => onApply(v)} title={`Show "${v.name}"`}>
            {v.name}
          </button>
          <button
            aria-label={`Delete view ${v.name}`}
            title="Delete this view"
            onClick={() => confirm(`Delete the "${v.name}" view?`) && save.mutate(views.filter((x) => x.id !== v.id))}
          >
            ×
          </button>
        </span>
      ))}
      {filtered && !current && (
        <button
          className="px-btn small"
          onClick={() => {
            const name = prompt("Name this view (e.g. QA queue, My ADO bugs):");
            if (name?.trim()) save.mutate([...views, { id: `v${Date.now().toString(36)}`, name: name.trim().slice(0, 40), filter, questions }]);
          }}
        >
          ★ Save view
        </button>
      )}
    </div>
  );
}
