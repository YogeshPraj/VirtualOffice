import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { celebrate } from "../ui/Confetti";

export interface GoalProgress {
  done: number;
  total: number;
  pct: number;
}

/** Progress of a goal from the tasks linked to it (cancelled ones don't count). */
export function goalProgress(goalId: string, issues: Pick<Issue, "goalId" | "status">[], isMain = false): GoalProgress {
  // Tasks with no goal stored belong to the main goal too.
  const linked = issues.filter((i) => (i.goalId === goalId || (isMain && !i.goalId)) && i.status !== "cancelled");
  const done = linked.filter((i) => i.status === "done").length;
  return { done, total: linked.length, pct: linked.length ? Math.round((done / linked.length) * 100) : 0 };
}

/**
 * Paperclip files every task that has no goal of its own under the company's main goal: the oldest
 * active top-level company goal (or, failing that, the oldest top-level company goal).
 */
export function defaultGoalId(goals: { id: string; level: string; status: string; parentId: string | null; createdAt: string }[] | undefined): string | null {
  const roots = (goals ?? []).filter((g) => g.level === "company" && !g.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (roots.find((g) => g.status === "active") ?? roots[0])?.id ?? null;
}

const STATUS_ICON: Record<string, string> = { planned: "○", active: "★", achieved: "🏆", cancelled: "✖" };

export const useGoals = (companyId: string) => useQuery({ queryKey: ["goals", companyId], queryFn: () => api.goals(companyId) });

/** The lobby's mission poster: company goals, with progress from their linked tasks. */
export function GoalPoster() {
  const { company, issues, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data: goals } = useGoals(company.id);
  const [title, setTitle] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["goals", company.id] });
    qc.invalidateQueries({ queryKey: keys.issues(company.id) });
  };
  const create = useMutation({
    mutationFn: () => api.createGoal(company.id, { title: title.trim(), level: "company", status: "active" }),
    onSuccess: () => {
      setTitle("");
      toast("Mission poster updated.");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateGoal(id, { status }),
    onSuccess: (_d, v) => {
      refresh();
      if (v.status === "achieved") celebrate(`Goal achieved: ${(goals ?? []).find((g) => g.id === v.id)?.title ?? "well done"}`);
    },
    onError: (e: Error) => toast(e.message),
  });
  const link = useMutation({
    mutationFn: ({ issueId, goalId }: { issueId: string; goalId: string | null }) => api.updateIssue(issueId, { goalId }),
    onSuccess: refresh,
    onError: (e: Error) => toast(e.message),
  });

  const mainId = defaultGoalId(goals);
  const list = (goals ?? []).filter((g) => showDone || (g.status !== "achieved" && g.status !== "cancelled"));
  const hidden = (goals ?? []).length - list.length;
  const unlinked = issues.filter((i) => (!i.goalId || i.goalId === defaultGoalId(goals)) && i.status !== "cancelled" && i.status !== "done" && !i.hiddenAt && i.workMode !== "ask");

  return (
    <div className="px-card">
      <h4>MISSION POSTER</h4>
      {(goals ?? []).length === 0 && <div className="muted">No goals on the wall yet. Goals give the team the why behind their tasks.</div>}
      {mainId && <div className="muted" style={{ fontSize: 15 }}>Tasks without a goal of their own count toward the main goal.</div>}
      {list.map((g) => {
        const isMain = g.id === mainId;
        const p = goalProgress(g.id, issues.filter((i) => i.workMode !== "ask" && !i.hiddenAt), isMain);
        const linked = issues.filter((i) => (i.goalId === g.id || (isMain && !i.goalId)) && i.status !== "cancelled" && i.workMode !== "ask" && !i.hiddenAt);
        return (
          <div key={g.id} className="goal">
            <button className="rpg-option" style={{ margin: 0, color: "var(--ink)" }} aria-expanded={openId === g.id} onClick={() => setOpenId(openId === g.id ? null : g.id)}>
              {STATUS_ICON[g.status] ?? "★"} {g.title}
              {g.id === mainId && <span className="tag" style={{ marginLeft: 6 }}>main goal</span>}
              <small style={{ color: "var(--muted)" }}>
                {p.total ? `${p.done}/${p.total} tasks done · ${p.pct}%` : "no tasks linked yet"} · {g.status}
              </small>
            </button>
            {p.total > 0 && (
              <div className="meter">
                <div style={{ width: `${p.pct}%`, background: p.pct === 100 ? "var(--good)" : undefined }} />
              </div>
            )}
            {openId === g.id && (
              <div style={{ margin: "4px 0 6px 8px" }}>
                {linked.map((i) => (
                  <div key={i.id} className="row work-row">
                    <button className="link-btn" style={{ flex: 1 }} onClick={() => open({ kind: "issue", issueId: i.id })}>
                      {i.status === "done" ? "☑" : "☐"} {i.identifier} {i.title}
                    </button>
                    {g.id !== mainId && (
                      <button className="px-btn small" aria-label={`Move ${i.identifier} back to the main goal`} title="Move back to the main goal" onClick={() => link.mutate({ issueId: i.id, goalId: null })}>
                        ✖
                      </button>
                    )}
                  </div>
                ))}
                <select className="px-select" aria-label={`Link a task to ${g.title}`} value="" onChange={(e) => e.target.value && link.mutate({ issueId: e.target.value, goalId: g.id })}>
                  <option value="">+ Link a task to this goal…</option>
                  {unlinked.map((i) => (
                    <option key={i.id} value={i.id}>{i.identifier} · {i.title.slice(0, 60)}</option>
                  ))}
                </select>
                <div className="row">
                  {g.status !== "achieved" && (
                    <button className="px-btn small good" onClick={() => setStatus.mutate({ id: g.id, status: "achieved" })}>🏆 Achieved</button>
                  )}
                  {g.status === "planned" && <button className="px-btn small" onClick={() => setStatus.mutate({ id: g.id, status: "active" })}>★ Start</button>}
                  {(g.status === "achieved" || g.status === "cancelled") && (
                    <button className="px-btn small" onClick={() => setStatus.mutate({ id: g.id, status: "active" })}>↺ Reopen</button>
                  )}
                  {g.status !== "cancelled" && (
                    <button className="px-btn small" onClick={() => confirm(`Take "${g.title}" off the wall?`) && setStatus.mutate({ id: g.id, status: "cancelled" })}>
                      Take down
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <button className="px-btn small" onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Hide finished goals" : `Show ${hidden} finished goal${hidden === 1 ? "" : "s"}`}
        </button>
      )}
      <input className="px-input" aria-label="New goal" placeholder="e.g. Ship v1 of the app by December" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="px-btn primary small" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
        Hang it up
      </button>
    </div>
  );
}
