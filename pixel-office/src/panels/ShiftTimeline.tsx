import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { HeartbeatRun } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

const COLOR: Record<string, string> = { succeeded: "#1d9e75", failed: "#e24b4a", timed_out: "#e24b4a", cancelled: "#9aa7b4", running: "#378add", queued: "#378add" };

export interface Bar {
  run: HeartbeatRun;
  start: number;
  end: number;
}

/** Shifts that overlap [from, to), clipped to it; a running shift ends now. */
export function shiftBars(runs: HeartbeatRun[], from: number, to: number, now = Date.now()): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const r of runs) {
    if (!r.startedAt) continue;
    const start = Date.parse(r.startedAt);
    const end = r.finishedAt ? Date.parse(r.finishedAt) : Math.min(now, to);
    if (end < from || start >= to) continue;
    out.set(r.agentId, [...(out.get(r.agentId) ?? []), { run: r, start: Math.max(start, from), end: Math.max(Math.min(end, to), Math.max(start, from) + 60_000) }]);
  }
  return out;
}

/** The hours worth drawing: from the first shift's hour to the last one's (at least 4 hours). */
export function visibleSpan(bars: Bar[], dayStart: number): [number, number] {
  if (!bars.length) return [dayStart + 9 * 3_600_000, dayStart + 18 * 3_600_000];
  const first = Math.min(...bars.map((b) => b.start));
  const last = Math.max(...bars.map((b) => b.end));
  const a = Math.floor((first - dayStart) / 3_600_000);
  const b = Math.max(a + 4, Math.ceil((last - dayStart) / 3_600_000));
  return [dayStart + a * 3_600_000, dayStart + Math.min(24, b) * 3_600_000];
}

/** Who worked when, today or yesterday, as one lane per employee. */
export function ShiftTimeline() {
  const { company, agents, issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [yesterday, setYesterday] = useState(false);
  const { data: runs } = useQuery({ queryKey: ["runs-recent", company.id, 500], queryFn: () => api.recentRuns(company.id, 500), refetchInterval: 60_000 });
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  if (yesterday) day.setDate(day.getDate() - 1);
  const from = day.getTime();
  const to = from + 86_400_000;
  const lanes = shiftBars(runs ?? [], from, to);
  const all = [...lanes.values()].flat();
  const [a, b] = visibleSpan(all, from);
  const people = agents.filter((x) => lanes.has(x.id));
  const W = 560;
  const LABEL = 90;
  const ROW = 22;
  const x = (t: number) => LABEL + ((t - a) / (b - a)) * (W - LABEL - 6);
  const hours = Array.from({ length: Math.round((b - a) / 3_600_000) + 1 }, (_, i) => a + i * 3_600_000);

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🕒 SHIFTS {yesterday ? "YESTERDAY" : "TODAY"}</h4>
        <button className="px-btn small" onClick={() => setYesterday((v) => !v)}>
          {yesterday ? "Today" : "Yesterday"}
        </button>
      </div>
      {!runs && <div className="muted">Reading the time sheets…</div>}
      {runs && !people.length && <div className="muted">Nobody worked a shift {yesterday ? "yesterday" : "today"}.</div>}
      {people.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <svg width={W} height={people.length * ROW + 22} role="img" aria-label="Shift timeline">
            {hours.map((h) => (
              <g key={h}>
                <line x1={x(h)} x2={x(h)} y1={0} y2={people.length * ROW} stroke="rgba(0,0,0,0.12)" />
                <text x={x(h)} y={people.length * ROW + 14} fontSize={11} textAnchor="middle" fill="var(--muted)">
                  {new Date(h).getHours()}:00
                </text>
              </g>
            ))}
            {people.map((p, row) => (
              <g key={p.id} transform={`translate(0, ${row * ROW})`}>
                <text x={0} y={15} fontSize={14} fill="var(--ink)">
                  {p.name.length > 11 ? `${p.name.slice(0, 10)}…` : p.name}
                </text>
                {lanes.get(p.id)!.map((bar) => {
                  const issueId = bar.run.contextSnapshot?.issueId;
                  const issue = issueId ? issues.find((i) => i.id === issueId) : undefined;
                  const mins = Math.max(1, Math.round((bar.end - bar.start) / 60_000));
                  return (
                    <rect
                      key={bar.run.id}
                      x={x(bar.start)}
                      y={4}
                      width={Math.max(3, x(bar.end) - x(bar.start))}
                      height={ROW - 8}
                      fill={COLOR[bar.run.status] ?? "#9aa7b4"}
                      stroke="var(--ink)"
                      strokeWidth={1}
                      style={{ cursor: issue ? "pointer" : undefined }}
                      onClick={() => issue && open({ kind: "issue", issueId: issue.id })}
                    >
                      <title>{`${new Date(bar.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${mins} min · ${bar.run.status.replace("_", " ")}${issue ? ` · ${issue.identifier} ${issue.title}` : ""}`}</title>
                    </rect>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      )}
      <div className="muted" style={{ fontSize: 14 }}>Green: finished · red: failed · blue: working now. Hover a shift for details; click to open its task.</div>
    </div>
  );
}
