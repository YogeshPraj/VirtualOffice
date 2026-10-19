import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Agent, Issue } from "../api/types";
import { staleDays } from "../lib/stale";
import { defaultGoalId, goalProgress, useGoals } from "../panels/GoalPoster";
import { reviewQueue } from "../panels/ReviewPanel";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { notifyCeo } from "./useNotifications";

export const WEEKLY_EVENT = "pixel-office:weekly-review";
const DONE_KEY = "pixel-office:weekly-review-done";
const WEEK = 7 * 86_400_000;

/** Monday of the week `d` is in, as YYYY-MM-DD: one review per week. */
export function weekOf(d = new Date()): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

/** Friday from 3 pm (or any later day of that week) and not reviewed yet this week. */
export function reviewDue(now: Date, doneWeek: string | null): boolean {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const late = (day === 5 && now.getHours() >= 15) || day === 6 || day === 0;
  return late && doneWeek !== weekOf(now);
}

type I = Pick<Issue, "id" | "identifier" | "title" | "status" | "assigneeAgentId" | "completedAt" | "updatedAt" | "lastActivityAt" | "hiddenAt">;

/** What shipped in the last 7 days, by employee (most first), and what went stale. */
export function weekSummary(issues: I[], agents: Pick<Agent, "id" | "name">[], now = Date.now()) {
  const name = new Map(agents.map((a) => [a.id, a.name]));
  const shipped = issues.filter((i) => i.status === "done" && !i.hiddenAt && now - Date.parse(i.completedAt ?? i.updatedAt) <= WEEK);
  const by = new Map<string, I[]>();
  for (const i of shipped) {
    const who = i.assigneeAgentId ? (name.get(i.assigneeAgentId) ?? "Someone") : "Unassigned";
    by.set(who, [...(by.get(who) ?? []), i]);
  }
  return {
    shipped: shipped.length,
    byPerson: [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([who, list]) => ({ who, list })),
    stale: issues.filter((i) => !i.hiddenAt && staleDays(i, now) !== null).map((i) => ({ issue: i, days: staleDays(i, now)! })),
  };
}

const STEPS = ["Shipped", "Gone stale", "Waiting for you", "Goals", "Time spent", "Next week"] as const;

/** The Friday walkthrough: one step at a time, with something to do on each. */
export function WeeklyReview() {
  const { company, issues, agents, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState(0);
  const goals = useGoals(company.id);
  const from = useMemo(() => new Date(Date.now() - WEEK).toISOString(), [shown]);
  const costs = useQuery({ queryKey: ["costs-by-agent-week", company.id, from], queryFn: () => api.costsByAgent(company.id, from), enabled: shown });
  const summary = weekSummary(issues, agents);
  const queue = reviewQueue(issues);
  const mainGoal = defaultGoalId(goals.data);

  useEffect(() => {
    const show = () => {
      setStep(0);
      setShown(true);
    };
    window.addEventListener(WEEKLY_EVENT, show);
    return () => window.removeEventListener(WEEKLY_EVENT, show);
  }, []);

  // The Friday nudge: once a week, after 3 pm.
  useEffect(() => {
    const nudge = () => {
      let done: string | null = null;
      let nudged: string | null = null;
      try {
        done = localStorage.getItem(DONE_KEY);
        nudged = localStorage.getItem(`${DONE_KEY}:nudged`);
      } catch {
        return;
      }
      const now = new Date();
      if (!reviewDue(now, done) || nudged === weekOf(now)) return;
      try {
        localStorage.setItem(`${DONE_KEY}:nudged`, weekOf(now));
      } catch {
        return;
      }
      toast("🗓 It's the end of the week: time for the weekly review (Ctrl+K → Weekly review).");
      notifyCeo("🗓 Weekly review", "Ten minutes on what shipped, what's stuck and next week.", () => window.dispatchEvent(new Event(WEEKLY_EVENT)), "weekly-review");
    };
    nudge();
    const t = setInterval(nudge, 15 * 60_000);
    return () => clearInterval(t);
  }, [toast]);

  if (!shown) return null;
  const go = (panel: Parameters<typeof open>[0]) => {
    setShown(false);
    open(panel);
  };
  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, weekOf());
    } catch {
      /* may nudge again */
    }
    setShown(false);
    toast("Week reviewed. Have a good weekend.");
  };
  const issueButton = (i: Pick<Issue, "id" | "identifier" | "title">, extra?: string) => (
    <div key={i.id}>
      <button className="link-btn" style={{ whiteSpace: "normal", textAlign: "left" }} onClick={() => go({ kind: "issue", issueId: i.id })}>
        {i.identifier} {i.title}
      </button>
      {extra && <span className="muted"> · {extra}</span>}
    </div>
  );
  const activeGoals = (goals.data ?? []).filter((g) => g.status === "active" || g.status === "planned");
  const spend = (costs.data ?? []).filter((c) => c.subscriptionRunCount + c.apiRunCount > 0).sort((a, b) => b.subscriptionRunCount + b.apiRunCount - (a.subscriptionRunCount + a.apiRunCount));

  return (
    <div className="palette-backdrop" onMouseDown={() => setShown(false)}>
      <div className="palette weekly-review" role="dialog" aria-label="Weekly review" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ margin: 0 }}>
          <h4 style={{ flex: 1, margin: 0 }}>
            🗓 WEEKLY REVIEW · {step + 1}/{STEPS.length} · {STEPS[step].toUpperCase()}
          </h4>
          <button className="px-btn small" onClick={() => setShown(false)}>Close</button>
        </div>
        <div className="weekly-step" style={{ fontSize: 16, margin: "8px 0", maxHeight: 380, overflow: "auto" }}>
          {step === 0 &&
            (summary.shipped ? (
              <>
                <div>🎉 {summary.shipped} task{summary.shipped === 1 ? "" : "s"} finished in the last 7 days.</div>
                {summary.byPerson.map((p) => (
                  <div key={p.who} style={{ marginTop: 6 }}>
                    <b>{p.who}</b> ({p.list.length})
                    {p.list.slice(0, 5).map((i) => issueButton(i))}
                    {p.list.length > 5 && <div className="muted">…and {p.list.length - 5} more</div>}
                  </div>
                ))}
              </>
            ) : (
              <div className="muted">Nothing was finished this week. Worth asking why on the next step.</div>
            ))}
          {step === 1 &&
            (summary.stale.length ? (
              <>
                <div>These open tasks haven't moved for a week or more. Nudge, reassign, park in the backlog or cancel each:</div>
                {summary.stale.map(({ issue, days }) => issueButton(issue, `${days} days`))}
              </>
            ) : (
              <div>🟢 Nothing has gone stale.</div>
            ))}
          {step === 2 &&
            (queue.length ? (
              <>
                <div>{queue.length} task{queue.length === 1 ? " is" : "s are"} waiting for your review:</div>
                {queue.slice(0, 8).map((i) => issueButton(i))}
                <button className="px-btn small" style={{ marginTop: 6 }} onClick={() => go({ kind: "room", room: "review" })}>
                  Open the review room
                </button>
              </>
            ) : (
              <div>🟢 Nothing is waiting for your review.</div>
            ))}
          {step === 3 &&
            (activeGoals.length ? (
              activeGoals.map((g) => {
                const p = goalProgress(g.id, issues, g.id === mainGoal);
                return (
                  <div key={g.id} style={{ marginBottom: 6 }}>
                    <b>{g.title}</b>: {p.done} of {p.total} tasks done ({p.pct}%)
                    <div className="note-checklist" style={{ maxWidth: 360 }}>
                      <span className="bar">
                        <span style={{ width: `${p.pct}%` }} />
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <>
                <div className="muted">No goals on the wall. Goals give the team the why behind their tasks.</div>
                <button className="px-btn small" onClick={() => go({ kind: "room", room: "lobby" })}>Set one in the lobby</button>
              </>
            ))}
          {step === 4 &&
            (costs.isLoading ? (
              <div className="muted">Adding it up…</div>
            ) : spend.length ? (
              spend.map((c) => (
                <div key={c.agentId}>
                  <b>{c.agentName}</b>: {c.subscriptionRunCount + c.apiRunCount} shift{c.subscriptionRunCount + c.apiRunCount === 1 ? "" : "s"}
                  {c.costCents > 0 ? ` · $${(c.costCents / 100).toFixed(2)}` : " · no metered cost"}
                </div>
              ))
            ) : (
              <div className="muted">No shifts this week.</div>
            ))}
          {step === 5 && (
            <>
              <div>Pick up to five priorities for next week and pin them to the focus list (☆ Focus on a task), or plan new work on the board.</div>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="px-btn small" onClick={() => go({ kind: "room", room: "meeting" })}>Open the task board</button>
                <button className="px-btn small" onClick={() => go({ kind: "room", room: "report" })}>Weekly report</button>
              </div>
            </>
          )}
        </div>
        <div className="row">
          <button className="px-btn small" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ◀ Back
          </button>
          <span style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button className="px-btn small primary" onClick={() => setStep((s) => s + 1)}>
              Next ▶
            </button>
          ) : (
            <button className="px-btn small good" onClick={finish}>
              ✔ Done for the week
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
