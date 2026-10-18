import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ActivityEntry } from "../api/types";
import { useActivity, useDashboard } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { ClassicLink } from "../ui/Window";
import { UsageCard } from "./UsageCard";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Lounge TV: the company's #general — every comment and hand-off, newest first. */
export function LoungePanel() {
  const { company, agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { data } = useActivity(company.id);
  const talk = (data ?? []).filter((a) => a.action === "issue.comment_added" || a.action === "issue.created" || a.action === "issue.thread_interaction_created");
  return (
    <>
      <p className="muted">Everything the team says, in one channel.</p>
      {talk.length === 0 && <div className="muted">Crickets. Pin a task and the chatter starts.</div>}
      {talk.map((a) => {
        const who = a.actorType === "agent" ? agentById(a.actorId) : undefined;
        const d = a.details ?? {};
        const text =
          a.action === "issue.comment_added"
            ? String(d.bodySnippet ?? "…")
            : a.action === "issue.created"
              ? `📌 pinned ${String(d.identifier ?? "")} ${String(d.title ?? "")}`
              : "❓ has a question for the CEO";
        const issueId = a.entityType === "issue" ? a.entityId : null;
        return (
          <div key={a.id} className={`chat-line ${who ? "" : "me"}`}>
            <Avatar agent={who} size={26} />
            <div className="bubble" onClick={() => issueId && open({ kind: "issue", issueId })} style={{ cursor: issueId ? "pointer" : undefined }}>
              <span className="who">
                {who?.name ?? (a.actorType === "system" ? "SYSTEM" : "YOU")} · {time(a.createdAt)}
                {typeof d.identifier === "string" ? ` · ${d.identifier}` : ""}
              </span>
              {text}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Finance office: spend vs budget for the company and each employee. */
export function FinancePanel() {
  const { company, agents } = useOfficeData();
  const { data: dash } = useDashboard(company.id);
  const staff = agents.filter((a) => a.status !== "terminated");
  const total = dash?.costs.monthSpendCents ?? company.spentMonthlyCents;
  const cap = dash?.costs.monthBudgetCents ?? company.budgetMonthlyCents;
  return (
    <>
      <div className="px-card">
        <h4>THIS MONTH</h4>
        <div style={{ fontSize: 30 }}>🪙 {money(total)}</div>
        <div className="muted">{cap > 0 ? `of ${money(cap)} company budget` : "No company-wide cap set"}</div>
        {cap > 0 && (
          <div className="meter">
            <div style={{ width: `${Math.min(100, (total / cap) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="px-card">
        <h4>PAYROLL</h4>
        {staff.map((a) => {
          const pct = a.budgetMonthlyCents > 0 ? Math.min(100, (a.spentMonthlyCents / a.budgetMonthlyCents) * 100) : 0;
          return (
            <div key={a.id} style={{ marginBottom: 8 }}>
              <div className="row">
                <Avatar agent={a} size={20} />
                <span style={{ flex: 1 }}>{a.name}</span>
                <span>
                  {money(a.spentMonthlyCents)}
                  {a.budgetMonthlyCents > 0 ? ` / ${money(a.budgetMonthlyCents)}` : ""}
                </span>
              </div>
              {a.budgetMonthlyCents > 0 && (
                <div className="meter">
                  <div style={{ width: `${pct}%`, background: pct > 85 ? "var(--bad)" : undefined }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <UsageCard />
      <ClassicLink path={`/${company.issuePrefix}/costs`}>Detailed costs ↗</ClassicLink>
    </>
  );
}

const ACTION_ICON: Record<string, string> = {
  "issue.created": "📌",
  "issue.updated": "✏️",
  "issue.comment_added": "💬",
  "agent.updated": "🧑",
  "approval.created": "📝",
  "agent.approved": "✅",
  "heartbeat.cancelled": "⛔",
};

/** Security room: the raw audit log. */
export function SecurityPanel() {
  const { company, agentById } = useOfficeData();
  const { data } = useActivity(company.id);
  const [filter, setFilter] = useState("");
  const rows = (data ?? []).filter((a: ActivityEntry) => !filter || a.action.includes(filter));
  return (
    <>
      <input className="px-input" aria-label="Filter" placeholder="filter: issue, agent, approval…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div style={{ background: "#0e1a12", color: "#7cf07c", padding: 10, boxShadow: "0 0 0 3px #000", fontSize: 18 }}>
        {rows.slice(0, 120).map((a) => {
          const who = a.actorType === "agent" ? agentById(a.actorId)?.name : a.actorType === "user" ? "you" : a.actorType;
          return (
            <div key={a.id}>
              [{time(a.createdAt)}] {ACTION_ICON[a.action] ?? "·"} {who ?? "?"} {a.action}
              {typeof a.details?.identifier === "string" ? ` ${a.details.identifier}` : ""}
            </div>
          );
        })}
        {rows.length === 0 && <div>NO SIGNAL</div>}
      </div>
    </>
  );
}

/** Lobby: the company, its mission and goals. */
export function LobbyPanel() {
  const { company, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data: goals } = useQuery({ queryKey: ["goals", company.id], queryFn: () => api.goals(company.id) });
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api.createGoal(company.id, { title: title.trim(), level: "company", status: "active" }),
    onSuccess: () => {
      setTitle("");
      toast("Mission poster updated.");
      qc.invalidateQueries({ queryKey: ["goals", company.id] });
    },
    onError: (e: Error) => toast(e.message),
  });
  return (
    <>
      <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }}>
        <h4>📥 INTAKE DESK</h4>
        <div style={{ marginBottom: 6 }}>Got ADO work items, GitHub issues or links for the team? Drop them here.</div>
        <button className="px-btn primary small" onClick={() => open({ kind: "room", room: "intake" })}>Open the intake desk</button>
      </div>
      <div className="px-card" style={{ textAlign: "center" }}>
        <h4 style={{ fontSize: 14, color: "var(--wood)" }}>{company.name}</h4>
        {company.description && <div>{company.description}</div>}
        <div className="muted">Task prefix: {company.issuePrefix}</div>
        <button className="px-btn small" style={{ marginTop: 6 }} onClick={() => window.dispatchEvent(new Event("pixel-office:tour"))}>
          🗺 Take the office tour
        </button>
      </div>
      <div className="px-card">
        <h4>MISSION POSTER</h4>
        {(goals ?? []).length === 0 && <div className="muted">No goals on the wall yet.</div>}
        {(goals ?? []).map((g) => (
          <div key={g.id} style={{ margin: "6px 0" }}>
            ★ {g.title} <span className="tag">{g.status}</span>
          </div>
        ))}
        <input className="px-input" aria-label="New goal" placeholder="e.g. Ship v1 of the app by December" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="px-btn primary small" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
          Hang it up
        </button>
      </div>
    </>
  );
}

/** Main floor: who's in today. */
export function FloorPanel() {
  const { agents, issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const staff = agents.filter((a) => a.status !== "terminated");
  return (
    <>
      {staff.map((a) => {
        const task = issues.find((i) => i.assigneeAgentId === a.id && i.status === "in_progress");
        return (
          <button key={a.id} className="rpg-option" style={{ color: "var(--ink)", display: "flex", gap: 10, alignItems: "center" }} onClick={() => open({ kind: "agent", agentId: a.id })}>
            <Avatar agent={a} size={24} />
            <span style={{ flex: 1 }}>
              {a.name}
              <small style={{ color: "var(--muted)" }}>{task ? `${task.identifier} · ${task.title}` : "no active task"}</small>
            </span>
            <span className={`tag ${a.status}`}>{a.status.replace("_", " ")}</span>
          </button>
        );
      })}
    </>
  );
}
