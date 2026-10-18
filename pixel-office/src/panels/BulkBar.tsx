import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import type { Issue, IssueStatus } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { inverseOf, isEmpty } from "../lib/undo";

type Change = Parameters<typeof api.updateIssue>[1];

/** Apply one change to many tasks, one at a time, and report what failed. */
export async function applyAll(ids: string[], change: Change, update: (id: string, c: Change) => Promise<unknown>, onProgress?: (done: number) => void) {
  const failed: { id: string; error: string }[] = [];
  let done = 0;
  for (const id of ids) {
    try {
      await update(id, change);
    } catch (e) {
      failed.push({ id, error: (e as Error).message });
    }
    onProgress?.(++done);
  }
  return failed;
}

/** The action bar shown while notes are selected on the board. */
export function BulkBar({ selected, onClear }: { selected: Set<string>; onClear: () => void }) {
  const { company, issues, agents, toast } = useOfficeData();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const ids = [...selected];
  const names = ids.map((id) => issues.find((i) => i.id === id)?.identifier).filter(Boolean);

  const run = async (label: string, change: Change, ask?: string) => {
    if (!ids.length || (ask && !confirm(ask))) return;
    const before = ids.map((id) => issues.find((i) => i.id === id)).filter((i): i is Issue => !!i);
    setBusy(`${label} 0/${ids.length}`);
    const failed = await applyAll(ids, change, (id, c) => api.updateIssue(id, c), (n) => setBusy(`${label} ${n}/${ids.length}`));
    setBusy(null);
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    if (failed.length) {
      const who = failed.map((f) => issues.find((i) => i.id === f.id)?.identifier ?? f.id).join(", ");
      toast(`${ids.length - failed.length} updated; ${failed.length} refused (${who}): ${failed[0].error}`);
    } else {
      toast(`${label}: ${ids.length} task${ids.length === 1 ? "" : "s"} updated.`, {
        undo: async () => {
          for (const b of before) {
            const back = inverseOf(b, change);
            if (!isEmpty(back)) await api.updateIssue(b.id, back);
          }
          qc.invalidateQueries({ queryKey: keys.issues(company.id) });
        },
      });
      onClear();
    }
  };

  const pick = (e: React.ChangeEvent<HTMLSelectElement>, f: (v: string) => void) => {
    const v = e.target.value;
    e.target.value = "";
    if (v) f(v);
  };

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Change selected tasks">
      <b>{ids.length} selected</b>
      <span className="muted" style={{ fontSize: 14, flex: 1, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names.join(", ")}</span>
      {busy ? (
        <span>{busy}…</span>
      ) : (
        <>
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Assign selected" defaultValue="" onChange={(e) => pick(e, (v) => run("Assigned", { assigneeAgentId: v === "none" ? null : v }))}>
            <option value="">Assign…</option>
            <option value="none">Unassigned</option>
            {staff.map((a) => (
              <option key={a.id} value={a.id}>→ {a.name}</option>
            ))}
          </select>
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Set priority of selected" defaultValue="" onChange={(e) => pick(e, (v) => run("Priority set", { priority: v as Issue["priority"] }))}>
            <option value="">Priority…</option>
            {["critical", "high", "medium", "low"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="px-select"
            style={{ width: "auto", margin: 0 }}
            aria-label="Set status of selected"
            defaultValue=""
            onChange={(e) =>
              pick(e, (v) => run("Moved", { status: v as IssueStatus }, v === "done" || v === "cancelled" ? `Mark ${ids.length} task(s) ${v}?` : undefined))
            }
          >
            <option value="">Status…</option>
            {["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <button className="px-btn small" onClick={onClear}>Done selecting</button>
        </>
      )}
    </div>
  );
}
