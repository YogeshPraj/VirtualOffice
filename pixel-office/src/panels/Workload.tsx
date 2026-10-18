import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import type { Agent, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { isQuestion } from "./AskEmployee";

const OPEN = new Set(["todo", "in_progress", "in_review", "blocked"]);
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export interface Load {
  agent: Agent;
  now: Issue[];
  queue: Issue[];
  blocked: number;
  review: number;
  idleMs: number | null;
}

/** Each employee's open work, busiest first. */
export function workload(agents: Agent[], issues: Issue[], now = Date.now()): Load[] {
  return agents
    .filter((a) => a.status !== "terminated" && a.status !== "pending_approval")
    .map((a) => {
      const mine = issues.filter((i) => i.assigneeAgentId === a.id && OPEN.has(i.status) && !isQuestion(i) && !i.hiddenAt);
      const last = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : null;
      return {
        agent: a,
        now: mine.filter((i) => i.status === "in_progress"),
        queue: mine.filter((i) => i.status === "todo").sort((x, y) => PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || x.createdAt.localeCompare(y.createdAt)),
        blocked: mine.filter((i) => i.status === "blocked").length,
        review: mine.filter((i) => i.status === "in_review").length,
        idleMs: a.status === "running" || !last ? null : now - last,
      };
    })
    .sort((x, y) => y.queue.length + y.now.length - (x.queue.length + x.now.length));
}

/** Suggest moving the busiest employee's next queued task to someone with nothing to do. */
export function suggestion(loads: Load[]): { task: Issue; from: Agent; to: Agent } | null {
  const free = loads.filter((l) => l.now.length === 0 && l.queue.length === 0 && l.agent.status !== "paused" && l.agent.status !== "error");
  const busy = loads.find((l) => l.queue.length >= 2);
  if (!busy || !free.length) return null;
  // Prefer someone in the same role, then anyone idle the longest.
  const to = free.find((l) => l.agent.role === busy.agent.role) ?? [...free].sort((a, b) => (b.idleMs ?? 0) - (a.idleMs ?? 0))[0];
  return { task: busy.queue[busy.queue.length - 1], from: busy.agent, to: to.agent };
}

const dur = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 172_800_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} days`);

/** The main floor's workload view: who has what, and a one-click rebalance. */
export function Workload() {
  const { company, agents, issues, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const loads = workload(agents, issues);
  const tip = suggestion(loads);
  const staff = loads.map((l) => l.agent);
  const max = Math.max(1, ...loads.map((l) => l.queue.length + l.now.length));
  const move = useMutation({
    mutationFn: ({ task, to }: { task: Issue; to: string }) => api.updateIssue(task.id, { assigneeAgentId: to }),
    onSuccess: (_d, v) => {
      toast(`Moved ${v.task.identifier} to ${agents.find((a) => a.id === v.to)?.name}.`);
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <>
      {tip && (
        <div className="px-card" style={{ borderLeft: "8px solid var(--accent)" }}>
          <h4>⚖ BALANCE THE TEAM</h4>
          <div style={{ fontSize: 17 }}>
            {tip.from.name} has a queue while {tip.to.name} has nothing to do. Move <b>{tip.task.identifier}</b> ({tip.task.title}) to {tip.to.name}?
          </div>
          <button className="px-btn small primary" disabled={move.isPending} onClick={() => move.mutate({ task: tip.task, to: tip.to.id })}>
            ➜ Move it to {tip.to.name}
          </button>
        </div>
      )}
      {loads.map((l) => {
        const total = l.now.length + l.queue.length;
        return (
          <div key={l.agent.id} className="px-card workload">
            <div className="row" style={{ margin: 0 }}>
              <Avatar agent={l.agent} size={28} />
              <button className="rpg-option" style={{ flex: 1, margin: 0, color: "var(--ink)" }} onClick={() => open({ kind: "agent", agentId: l.agent.id })}>
                {l.agent.name}
                <small style={{ color: "var(--muted)" }}>
                  {l.agent.status === "running" ? "working now" : l.idleMs !== null ? `idle ${dur(l.idleMs)}` : "never clocked in"}
                  {l.blocked ? ` · ${l.blocked} blocked` : ""}
                  {l.review ? ` · ${l.review} in review` : ""}
                </small>
              </button>
              <span className={`tag ${l.agent.status}`}>{l.agent.status.replace("_", " ")}</span>
            </div>
            <div className="meter" title={`${total} open`}>
              <div style={{ width: `${(total / max) * 100}%`, background: total > 4 ? "var(--bad)" : undefined }} />
            </div>
            {l.now.map((i) => (
              <div key={i.id} className="row work-row">
                <button className="link-btn" onClick={() => open({ kind: "issue", issueId: i.id })}>⌨ {i.identifier} {i.title}</button>
              </div>
            ))}
            {l.queue.map((i) => (
              <div key={i.id} className="row work-row">
                <button className="link-btn" style={{ flex: 1 }} onClick={() => open({ kind: "issue", issueId: i.id })}>
                  ⏳ {i.identifier} {i.title}
                  {i.priority === "critical" || i.priority === "high" ? " !" : ""}
                </button>
                <select
                  className="px-select"
                  style={{ width: "auto", margin: 0, fontSize: 14 }}
                  aria-label={`Reassign ${i.identifier}`}
                  value=""
                  onChange={(e) => e.target.value && move.mutate({ task: i, to: e.target.value })}
                >
                  <option value="">Move…</option>
                  {staff
                    .filter((a) => a.id !== l.agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>→ {a.name}</option>
                    ))}
                </select>
              </div>
            ))}
            {total === 0 && <div className="muted" style={{ fontSize: 15 }}>Nothing assigned.</div>}
          </div>
        );
      })}
    </>
  );
}
