import type { Agent, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

const WEEK = 7 * 86_400_000;

export interface Honour {
  agentId: string;
  count: number;
  latest: string;
  tasks: Pick<Issue, "id" | "identifier" | "title">[];
}

/** Whoever finished the most tasks in the last 7 days; ties go to whoever finished last. */
export function employeeOfWeek(issues: Pick<Issue, "id" | "identifier" | "title" | "status" | "assigneeAgentId" | "completedAt" | "updatedAt">[], agents: Pick<Agent, "id" | "status">[], now = Date.now()): Honour | null {
  const active = new Set(agents.filter((a) => a.status !== "terminated").map((a) => a.id));
  const by = new Map<string, Honour>();
  for (const i of issues) {
    if (i.status !== "done" || !i.assigneeAgentId || !active.has(i.assigneeAgentId)) continue;
    const at = i.completedAt ?? i.updatedAt;
    if (now - Date.parse(at) > WEEK) continue;
    const h = by.get(i.assigneeAgentId) ?? { agentId: i.assigneeAgentId, count: 0, latest: at, tasks: [] };
    h.count++;
    if (at > h.latest) h.latest = at;
    h.tasks.push({ id: i.id, identifier: i.identifier, title: i.title });
    by.set(i.assigneeAgentId, h);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))[0] ?? null;
}

/** The framed picture on the lobby wall. */
export function EmployeeOfWeek() {
  const { issues, agents, agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const honour = employeeOfWeek(issues, agents);
  const who = honour ? agentById(honour.agentId) : undefined;
  if (!honour || !who) {
    return (
      <div className="px-card eotw" style={{ textAlign: "center" }}>
        <h4>🏆 EMPLOYEE OF THE WEEK</h4>
        <div className="muted">The frame's empty: nobody has finished a task in the last 7 days.</div>
      </div>
    );
  }
  return (
    <div className="px-card eotw" style={{ textAlign: "center" }}>
      <h4>🏆 EMPLOYEE OF THE WEEK</h4>
      <div style={{ fontSize: 24 }}>{who.name}</div>
      {who.title && <div className="muted">{who.title}</div>}
      <div style={{ margin: "4px 0" }}>
        Finished {honour.count} task{honour.count === 1 ? "" : "s"} in the last 7 days
      </div>
      <div style={{ fontSize: 15, textAlign: "left" }}>
        {honour.tasks.slice(0, 3).map((t) => (
          <div key={t.id}>
            <button className="link-btn" style={{ whiteSpace: "normal", textAlign: "left" }} onClick={() => open({ kind: "issue", issueId: t.id })}>
              ✔ {t.identifier} {t.title}
            </button>
          </div>
        ))}
        {honour.tasks.length > 3 && <div className="muted">…and {honour.tasks.length - 3} more</div>}
      </div>
      <button className="px-btn small" style={{ marginTop: 6 }} onClick={() => open({ kind: "agent", agentId: who.id })}>
        Visit {who.name}'s desk
      </button>
    </div>
  );
}
