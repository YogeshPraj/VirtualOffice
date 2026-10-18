import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { HeartbeatRun } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";

const WINDOWS = { "24h": 1, "7d": 7, "30d": 30 } as const;
type Win = keyof typeof WINDOWS;

const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const mins = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.max(1, Math.round(ms / 60_000))} min`);

interface Row {
  agentId: string;
  shifts: number;
  failed: number;
  avgMs: number;
  input: number;
  cached: number;
  output: number;
  cents: number;
}

/** Shifts, failures and tokens per employee over a window, from Paperclip's runs and cost ledger. */
export function UsageCard() {
  const { company, agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [win, setWin] = useState<Win>("7d");
  const from = new Date(Date.now() - WINDOWS[win] * 86_400_000).toISOString();
  const costs = useQuery({ queryKey: ["costs-by-agent", company.id, win], queryFn: () => api.costsByAgent(company.id, from), refetchInterval: 300_000 });
  const runs = useQuery({ queryKey: ["runs-recent", company.id, 500], queryFn: () => api.recentRuns(company.id, 500), refetchInterval: 300_000 });

  const since = Date.parse(from);
  const inWin = (runs.data ?? []).filter((r) => r.startedAt && Date.parse(r.startedAt) >= since);
  const byAgent = new Map<string, HeartbeatRun[]>();
  for (const r of inWin) byAgent.set(r.agentId, [...(byAgent.get(r.agentId) ?? []), r]);
  const ids = new Set([...byAgent.keys(), ...(costs.data ?? []).map((c) => c.agentId)]);
  const rows: Row[] = [...ids].map((id) => {
    const rs = byAgent.get(id) ?? [];
    const c = costs.data?.find((x) => x.agentId === id);
    const done = rs.filter((r) => r.startedAt && r.finishedAt);
    return {
      agentId: id,
      shifts: rs.length,
      failed: rs.filter((r) => r.status === "failed" || r.status === "timed_out").length,
      avgMs: done.length ? done.reduce((n, r) => n + (Date.parse(r.finishedAt!) - Date.parse(r.startedAt!)), 0) / done.length : 0,
      input: c?.inputTokens ?? 0,
      cached: c?.cachedInputTokens ?? 0,
      output: c?.outputTokens ?? 0,
      cents: c?.costCents ?? 0,
    };
  });
  rows.sort((a, b) => b.input + b.output - (a.input + a.output) || b.shifts - a.shifts);
  const total = rows.reduce((t, r) => ({ ...t, shifts: t.shifts + r.shifts, failed: t.failed + r.failed, input: t.input + r.input, cached: t.cached + r.cached, output: t.output + r.output, cents: t.cents + r.cents }), {
    shifts: 0,
    failed: 0,
    input: 0,
    cached: 0,
    output: 0,
    cents: 0,
  });
  const truncated = (runs.data?.length ?? 0) >= 500 && inWin.length === runs.data?.length;

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>📊 USAGE BY EMPLOYEE</h4>
        {(Object.keys(WINDOWS) as Win[]).map((w) => (
          <button key={w} className={`px-btn small ${w === win ? "primary" : ""}`} onClick={() => setWin(w)}>
            {w}
          </button>
        ))}
      </div>
      {(costs.isLoading || runs.isLoading) && <div className="muted">Counting…</div>}
      {rows.length === 0 && !costs.isLoading && <div className="muted">Nobody worked in this window.</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="usage-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th title="Runs started in the window">Shifts</th>
                <th>Failed</th>
                <th title="Average shift length">Avg</th>
                <th title="Input tokens (cached reads in brackets)">In</th>
                <th>Out</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = agentById(r.agentId);
                const failRate = r.shifts ? r.failed / r.shifts : 0;
                return (
                  <tr key={r.agentId} onClick={() => a && open({ kind: "agent", agentId: a.id })} style={{ cursor: a ? "pointer" : undefined }}>
                    <td>
                      <span className="row" style={{ margin: 0, gap: 4 }}>
                        <Avatar agent={a} size={18} /> {a?.name ?? "former employee"}
                      </span>
                    </td>
                    <td>{r.shifts}</td>
                    <td style={{ color: failRate > 0.25 ? "var(--bad)" : undefined }}>{r.failed || "–"}</td>
                    <td>{r.avgMs ? mins(r.avgMs) : "–"}</td>
                    <td>
                      {tok(r.input)}
                      {r.cached ? <small className="muted"> ({tok(r.cached)})</small> : null}
                    </td>
                    <td>{tok(r.output)}</td>
                    <td>{r.cents ? `$${(r.cents / 100).toFixed(2)}` : "–"}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Total</td>
                <td>{total.shifts}</td>
                <td>{total.failed || "–"}</td>
                <td />
                <td>
                  {tok(total.input)}
                  {total.cached ? <small className="muted"> ({tok(total.cached)})</small> : null}
                </td>
                <td>{tok(total.output)}</td>
                <td>{total.cents ? `$${(total.cents / 100).toFixed(2)}` : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>
        Subscription work (Claude, Copilot) shows tokens but no cost. {truncated ? "Only the latest 500 shifts are counted." : ""}
      </div>
    </div>
  );
}
