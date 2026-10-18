import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Agent } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { fmtDuration, scorecard } from "../lib/stats";

const DAYS = 30;

/** An employee's last 30 days at a glance. */
export function Scorecard({ agent }: { agent: Agent }) {
  const { company, issues } = useOfficeData();
  const runs = useQuery({ queryKey: ["runs-recent", company.id, 500], queryFn: () => api.recentRuns(company.id, 500), staleTime: 120_000 });
  const activity = useQuery({ queryKey: ["issue-activity-all", company.id], queryFn: () => api.companyIssueActivity(company.id), staleTime: 300_000 });
  if (!runs.data || !activity.data) return null;
  const since = Date.now() - DAYS * 86_400_000;
  const s = scorecard(agent.id, issues, runs.data, activity.data, since);
  if (!s.done && !s.shifts && !s.open) return null;
  const pct = s.failureRate === null ? "–" : `${Math.round(s.failureRate * 100)}%`;
  return (
    <div className="px-card">
      <h4>📈 LAST {DAYS} DAYS</h4>
      <div className="score-grid">
        <div>
          <b>{s.done}</b>
          <small>tasks done</small>
        </div>
        <div>
          <b>{fmtDuration(s.medianCycleMs)}</b>
          <small>typical time to finish</small>
        </div>
        <div style={s.failureRate !== null && s.failureRate > 0.25 ? { color: "var(--bad)" } : undefined}>
          <b>{pct}</b>
          <small>
            shifts failed ({s.failedShifts}/{s.shifts})
          </small>
        </div>
        <div style={s.bounces > 2 ? { color: "var(--bad)" } : undefined}>
          <b>{s.bounces}</b>
          <small>sent back from review</small>
        </div>
        <div>
          <b>{s.open}</b>
          <small>open now</small>
        </div>
      </div>
    </div>
  );
}
