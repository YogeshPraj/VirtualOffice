import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api/client";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { NOTE_COLORS } from "./MeetingPanel";

const OPEN = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const MAX_FETCH = 80;
const W = 150;
const H = 46;
const GX = 54;
const GY = 12;

export interface Edge {
  from: string; // the blocker
  to: string; // the task waiting on it
}

/**
 * Lay out waiting chains: column = how many open blockers stand in front of a task (longest path),
 * and for each task how many others it frees, directly or down the chain. Cycles are cut.
 */
export function chainLayout(edges: Edge[]) {
  const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  const before = new Map(ids.map((id) => [id, edges.filter((e) => e.to === id).map((e) => e.from)]));
  const after = new Map(ids.map((id) => [id, edges.filter((e) => e.from === id).map((e) => e.to)]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, path: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (path.has(id)) return 0; // a cycle: stop here
    path.add(id);
    const d = Math.max(-1, ...(before.get(id) ?? []).map((b) => depthOf(b, path))) + 1;
    path.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach((id) => depthOf(id, new Set()));
  const frees = new Map<string, number>();
  for (const id of ids) {
    const seen = new Set<string>();
    const stack = [...(after.get(id) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === id || seen.has(n)) continue;
      seen.add(n);
      stack.push(...(after.get(n) ?? []));
    }
    frees.set(id, seen.size);
  }
  // Rows within a column: the tasks that free the most go first.
  const cols = new Map<number, string[]>();
  for (const id of ids) cols.set(depth.get(id)!, [...(cols.get(depth.get(id)!) ?? []), id]);
  const row = new Map<string, number>();
  for (const [, list] of cols) list.sort((a, b) => frees.get(b)! - frees.get(a)!).forEach((id, n) => row.set(id, n));
  return { ids, depth, row, frees };
}

/** Company-wide: which open tasks wait on which, so long chains and key blockers stand out. */
export function BlockerChains() {
  const { issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [shown, setShown] = useState(false);
  const candidates = issues.filter((i) => OPEN.has(i.status) && !i.hiddenAt).slice(0, MAX_FETCH);
  const details = useQueries({
    queries: candidates.map((i) => ({ queryKey: ["issue", i.id, i.updatedAt], queryFn: () => api.issue(i.id), enabled: shown, staleTime: 60_000 })),
  });
  const byId = new Map(issues.map((i) => [i.id, i]));
  const edges: Edge[] = details.flatMap((d) =>
    (d.data?.blockedBy ?? []).filter((b) => OPEN.has(b.status) && byId.has(b.id)).map((b) => ({ from: b.id, to: d.data!.id })),
  );
  const loading = shown && details.some((d) => d.isLoading);
  const { ids, depth, row, frees } = chainLayout(edges);
  const pos = new Map(ids.map((id) => [id, { x: 8 + depth.get(id)! * (W + GX), y: 8 + row.get(id)! * (H + GY) }]));
  const width = Math.max(0, ...ids.map((id) => depth.get(id)!)) * (W + GX) + W + 16;
  const height = Math.max(0, ...ids.map((id) => row.get(id)!)) * (H + GY) + H + 16;
  const key = [...ids].sort((a, b) => frees.get(b)! - frees.get(a)!)[0];

  return (
    <div className="px-card" aria-label="Waiting chains">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>⛓ WAITING CHAINS {shown && !loading ? <span className="muted">{edges.length} link{edges.length === 1 ? "" : "s"}</span> : null}</h4>
        <button className="px-btn small" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {shown && loading && <div className="muted">Reading who waits on whom…</div>}
      {shown && !loading && !edges.length && <div>🟢 No open task is waiting on another.</div>}
      {shown && !loading && edges.length > 0 && (
        <>
          {key && frees.get(key)! > 1 && (
            <div style={{ fontSize: 16, marginBottom: 4 }}>
              🔑 Finishing <b>{byId.get(key)?.identifier}</b> frees {frees.get(key)} tasks down the line.
            </div>
          )}
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <svg width={width} height={height} role="img" aria-label="Open tasks and what they wait on" style={{ display: "block" }}>
              <defs>
                <marker id="arrow-chain" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--bad)" />
                </marker>
              </defs>
              {edges.map((e, k) => {
                const a = pos.get(e.from)!;
                const b = pos.get(e.to)!;
                const x1 = a.x + W;
                const y1 = a.y + H / 2;
                const x2 = b.x - 2;
                const y2 = b.y + H / 2;
                return <path key={k} d={`M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`} fill="none" stroke="var(--bad)" strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#arrow-chain)" />;
              })}
              {ids.map((id) => {
                const i = byId.get(id);
                const p = pos.get(id)!;
                if (!i) return null;
                const n = frees.get(id)!;
                return (
                  <g key={id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} onClick={() => open({ kind: "issue", issueId: id })}>
                    <title>{`${i.identifier} ${i.title} (${i.status.replace("_", " ")})${n ? `: frees ${n}` : ""}`}</title>
                    <rect width={W} height={H} fill={NOTE_COLORS[i.status] ?? "#eee"} stroke="#1e1a24" strokeWidth={id === key && n > 1 ? 4 : 2} />
                    <text x={6} y={15} fontSize={9} fontFamily="var(--font-title)" fill="#1e1a24">
                      {i.identifier}
                    </text>
                    {n > 0 && (
                      <text x={W - 6} y={15} fontSize={13} textAnchor="end" fill="#8a1f1f">
                        frees {n}
                      </text>
                    )}
                    <text x={6} y={33} fontSize={15} fill="#1e1a24">
                      {i.title.length > 20 ? `${i.title.slice(0, 19)}…` : i.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            Left to right: a task waits on the ones before it. Click a note to open it.
            {candidates.length >= MAX_FETCH ? ` Looked at the first ${MAX_FETCH} open tasks.` : ""}
          </div>
        </>
      )}
    </div>
  );
}
