import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { NOTE_COLORS } from "./MeetingPanel";

const MAX_NODES = 40;
const W = 150;
const H = 46;
const GX = 40;
const GY = 14;

export interface MapNode {
  id: string;
  depth: number;
  row: number;
}

/** The top of a task's tree. */
export function rootOf(id: string, byId: Map<string, Pick<Issue, "id" | "parentId">>): string {
  let cur = id;
  const seen = new Set<string>();
  while (byId.get(cur)?.parentId && byId.has(byId.get(cur)!.parentId!) && !seen.has(cur)) {
    seen.add(cur);
    cur = byId.get(cur)!.parentId!;
  }
  return cur;
}

/** Lay a tree out in columns by depth, children in creation order (a tidy, dependency-free layout). */
export function layout(rootId: string, issues: Pick<Issue, "id" | "parentId" | "createdAt" | "status">[]): MapNode[] {
  const kids = new Map<string, string[]>();
  for (const i of [...issues].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!i.parentId || i.status === "cancelled") continue;
    kids.set(i.parentId, [...(kids.get(i.parentId) ?? []), i.id]);
  }
  const out: MapNode[] = [];
  let row = 0;
  const walk = (id: string, depth: number) => {
    if (out.length >= MAX_NODES || out.some((n) => n.id === id)) return;
    const node: MapNode = { id, depth, row: 0 };
    out.push(node);
    const children = kids.get(id) ?? [];
    if (!children.length) {
      node.row = row++;
      return;
    }
    const start = row;
    for (const c of children) walk(c, depth + 1);
    // A parent sits level with the middle of its children.
    node.row = (start + row - 1) / 2;
  };
  walk(rootId, 0);
  return out;
}

/** A picture of a task's family (sub-tasks) and what waits on what. */
export function TaskMap({ issue }: { issue: Issue }) {
  const { issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [shown, setShown] = useState(false);
  const byId = new Map(issues.map((i) => [i.id, i]));
  const root = rootOf(issue.id, byId);
  const nodes = layout(root, issues);
  // Blockers live on each task's own record.
  const details = useQueries({
    queries: nodes.map((n) => ({ queryKey: ["issue", n.id, byId.get(n.id)?.updatedAt], queryFn: () => api.issue(n.id), enabled: shown, staleTime: 60_000 })),
  });
  const inMap = new Set(nodes.map((n) => n.id));
  const blockEdges = details.flatMap((d) => (d.data?.blockedBy ?? []).filter((b) => inMap.has(b.id)).map((b) => ({ from: b.id, to: d.data!.id })));
  const outside = details.flatMap((d) => (d.data?.blockedBy ?? []).filter((b) => !inMap.has(b.id)).map((b) => ({ ...b, waiting: d.data!.identifier })));

  if (nodes.length < 2 && !(issue.blockedBy?.length || issue.blocks?.length)) {
    // Nothing to draw yet; the card would only say "it's just this task".
    if (!shown) return null;
  }
  const pos = new Map(nodes.map((n) => [n.id, { x: 8 + n.depth * (W + GX), y: 8 + n.row * (H + GY) }]));
  const width = Math.max(...nodes.map((n) => n.depth)) * (W + GX) + W + 80; // room for side arrows
  const height = Math.max(...nodes.map((n) => n.row)) * (H + GY) + H + 16;

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🗺 MAP {nodes.length > 1 ? <span className="muted">{nodes.length} tasks</span> : null}</h4>
        <button className="px-btn small" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {shown && (
        <>
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <svg width={width} height={height} role="img" aria-label="Task map: sub-tasks and blockers" style={{ display: "block" }}>
              <defs>
                <marker id="arrow-block" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--bad)" />
                </marker>
              </defs>
              {nodes.map((n) => {
                const parent = byId.get(n.id)?.parentId;
                const a = parent ? pos.get(parent) : undefined;
                const b = pos.get(n.id)!;
                if (!a) return null;
                const x1 = a.x + W;
                const y1 = a.y + H / 2;
                const x2 = b.x;
                const y2 = b.y + H / 2;
                return <path key={`t${n.id}`} d={`M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`} fill="none" stroke="var(--ink)" strokeWidth={2} />;
              })}
              {blockEdges.map((e, k) => {
                const a = pos.get(e.from)!;
                const b = pos.get(e.to)!;
                // Same column: loop round the right-hand side, so arrows don't run over the notes.
                const d =
                  a.x === b.x
                    ? `M${a.x + W},${a.y + H / 2} C${a.x + W + 34 + Math.abs(a.y - b.y) / 8},${a.y + H / 2} ${b.x + W + 34 + Math.abs(a.y - b.y) / 8},${b.y + H / 2} ${b.x + W + 2},${b.y + H / 2}`
                    : `M${a.x + W / 2},${a.y + H} Q${(a.x + b.x) / 2 + W / 2},${Math.max(a.y, b.y) + H + 24} ${b.x + W / 2},${b.y + H}`;
                return (
                  <path
                    key={`b${k}`}
                    d={d}
                    fill="none"
                    stroke="var(--bad)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    markerEnd="url(#arrow-block)"
                  />
                );
              })}
              {nodes.map((n) => {
                const i = byId.get(n.id)!;
                const p = pos.get(n.id)!;
                const here = n.id === issue.id;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} onClick={() => open({ kind: "issue", issueId: n.id })}>
                    <title>{`${i.identifier} ${i.title} (${i.status.replace("_", " ")})`}</title>
                    <rect width={W} height={H} fill={NOTE_COLORS[i.status] ?? "#eee"} stroke="var(--ink)" strokeWidth={here ? 4 : 2} />
                    <text x={6} y={15} fontSize={11} fontFamily="var(--font-title)" fill="var(--ink)">
                      {i.identifier}
                    </text>
                    <text x={6} y={33} fontSize={15} fill="var(--ink)">
                      {i.title.length > 20 ? `${i.title.slice(0, 19)}…` : i.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            Lines: sub-tasks. Dashed red arrows: waits on. Click a note to open it.
            {nodes.length >= MAX_NODES ? ` Showing the first ${MAX_NODES} tasks.` : ""}
          </div>
          {outside.length > 0 && (
            <div style={{ fontSize: 15 }}>
              Also waiting on tasks outside this tree:{" "}
              {outside.map((o) => (
                <a key={`${o.id}-${o.waiting}`} href="#" onClick={(e) => (e.preventDefault(), open({ kind: "issue", issueId: o.id }))} style={{ marginRight: 8 }}>
                  {o.waiting} → {o.identifier}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
