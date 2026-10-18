import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { cycleSummary, fmtDuration } from "../lib/stats";

export type Day = "today" | "yesterday" | "week" | "lastweek";

const PERIOD_LABEL: Record<Day, string> = { today: "Today", yesterday: "Yesterday", week: "This week", lastweek: "Last week" };

/** [start, end) of the period; weeks start on Monday. */
export function dayRange(day: Day, now = new Date()): [number, number] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (day === "today" || day === "yesterday") {
    if (day === "yesterday") start.setDate(start.getDate() - 1);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 1);
  } else {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    if (day === "lastweek") start.setDate(start.getDate() - 7);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  }
  return [start.getTime(), end.getTime()];
}

const isWeek = (d: Day) => d === "week" || d === "lastweek";

/** The copyable stand-up text as a Markdown document: title, section headings and bullets. */
export function toMarkdown(text: string): string {
  return (
    text
      .split("\n")
      .map((l, i) => {
        if (i === 0) return `# ${l}`;
        if (/^\S.*:$/.test(l)) return `\n## ${l.slice(0, -1)}`;
        if (/^ {2}- /.test(l)) return l.slice(2);
        return l;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const within = (iso: string | null | undefined, [a, b]: [number, number]) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= a && t < b;
};

const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** "Today at the office": a stand-up summary of the company's day, copyable as text. */
export function ReportPanel() {
  const { company, issues, agents, attention, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [day, setDay] = useState<Day>("today");
  const range = dayRange(day);
  const { data: spend } = useQuery({ queryKey: ["window-spend", company.id], queryFn: () => api.windowSpend(company.id), refetchInterval: 120_000 });
  const { data: runs } = useQuery({ queryKey: ["runs-recent", company.id, 500], queryFn: () => api.recentRuns(company.id, 500), refetchInterval: 120_000 });
  // Week views report the week's own token use rather than the last 24h.
  const { data: weekCosts } = useQuery({
    queryKey: ["costs-by-agent-range", company.id, range[0]],
    queryFn: () => api.costsByAgent(company.id, new Date(range[0]).toISOString(), new Date(range[1]).toISOString()),
    enabled: isWeek(day),
  });

  const report = useMemo(() => {
    const live = issues.filter((i) => !i.hiddenAt && i.workMode !== "ask");
    const done = live.filter((i) => i.status === "done" && within(i.completedAt ?? i.updatedAt, range));
    const started = live.filter((i) => within(i.startedAt, range) && i.status !== "done");
    const doing = live.filter((i) => i.status === "in_progress");
    const review = live.filter((i) => i.status === "in_review");
    const blocked = live.filter((i) => i.status === "blocked");
    const created = live.filter((i) => within(i.createdAt, range));
    const shifts = (runs ?? []).filter((r) => within(r.startedAt, range));
    const failed = shifts.filter((r) => r.status === "failed" || r.status === "timed_out");
    const perAgent = agents
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        agent: a,
        done: done.filter((i) => i.assigneeAgentId === a.id).length,
        shifts: shifts.filter((r) => r.agentId === a.id).length,
        now: doing.filter((i) => i.assigneeAgentId === a.id),
      }))
      .filter((x) => x.done || x.shifts || x.now.length);
    // Done per day, for the week's little bar chart.
    const perDay: { label: string; done: number }[] = [];
    if (isWeek(day)) {
      for (let d = 0; d < 7; d++) {
        const a = range[0] + d * 86_400_000;
        perDay.push({ label: new Date(a).toLocaleDateString([], { weekday: "short" }), done: done.filter((i) => within(i.completedAt ?? i.updatedAt, [a, a + 86_400_000])).length });
      }
    }
    return { done, started, doing, review, blocked, created, shifts, failed, perAgent, perDay };
  }, [issues, agents, runs, range[0]]);

  const tokens24 = spend?.filter((s) => s.window === "24h") ?? [];
  const cents24 = tokens24.reduce((n, s) => n + (s.costCents ?? 0), 0);
  const tok24 = tokens24.reduce((n, s) => n + (s.inputTokens ?? 0) + (s.outputTokens ?? 0), 0);

  const who = (i: Issue) => agentById(i.assigneeAgentId)?.name ?? "unassigned";
  const { data: issueActivity } = useQuery({ queryKey: ["issue-activity-all", company.id], queryFn: () => api.companyIssueActivity(company.id), staleTime: 300_000 });
  const cycle = cycleSummary(issues, range[0], range[1], issueActivity ?? []);
  const label = PERIOD_LABEL[day];
  const dateText = isWeek(day)
    ? `${new Date(range[0]).toLocaleDateString([], { day: "numeric", month: "short" })} – ${new Date(range[1] - 1).toLocaleDateString([], { day: "numeric", month: "short" })}`
    : new Date(range[0]).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  const weekTok = (weekCosts ?? []).reduce((n, c) => n + c.inputTokens + c.outputTokens, 0);
  const weekCents = (weekCosts ?? []).reduce((n, c) => n + c.costCents, 0);
  const usageText = isWeek(day)
    ? `${fmtTokens(weekTok)} tokens ${day === "week" ? "so far this week" : "last week"}${weekCents ? ` · $${(weekCents / 100).toFixed(2)}` : ""}`
    : `${fmtTokens(tok24)} tokens / 24h${cents24 ? ` · $${(cents24 / 100).toFixed(2)}` : ""}`;

  const asText = () => {
    const list = (items: Issue[]) => (items.length ? items.map((i) => `  - ${i.identifier} ${i.title} (${who(i)})`).join("\n") : "  - none");
    return [
      `${company.name}: ${label.toLowerCase()} at the office (${dateText})`,
      "",
      `Done (${report.done.length}):`,
      list(report.done),
      `In progress (${report.doing.length}):`,
      list(report.doing),
      `Ready for review (${report.review.length}):`,
      list(report.review),
      `Blocked (${report.blocked.length}):`,
      list(report.blocked),
      `Waiting on me (${attention.length}):`,
      attention.length ? attention.map((a) => `  - ${a.subject.identifier ?? ""} ${a.subject.title}`.trimEnd()).join("\n") : "  - none",
      "",
      `New tasks: ${report.created.length} · Shifts worked: ${report.shifts.length}${report.failed.length ? ` (${report.failed.length} failed)` : ""}`,
      `Usage: ${usageText}`,
      ...(cycle.count
        ? [`Typical time to finish: ${fmtDuration(cycle.medianMs)} (${cycle.count} task${cycle.count === 1 ? "" : "s"}); slowest: ${cycle.slowest.map((x) => `${x.issue.identifier} ${fmtDuration(x.ms)}`).join(", ")}`]
        : []),
      ...(isWeek(day) ? ["", "Who did what:", ...report.perAgent.map((x) => `  - ${x.agent.name}: ${x.done} done, ${x.shifts} shifts`)] : []),
    ].join("\n");
  };

  const Section = ({ title, items, tone }: { title: string; items: Issue[]; tone?: string }) => (
    <div className="px-card" style={tone ? { borderLeft: `8px solid ${tone}` } : undefined}>
      <h4>
        {title} <span className="muted">{items.length}</span>
      </h4>
      {items.length === 0 && <div className="muted">None.</div>}
      {items.map((i) => (
        <button key={i.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: i.id })}>
          {i.identifier} · {i.title}
          <small style={{ color: "var(--muted)" }}>@{who(i)}</small>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="px-card">
        <div className="row">
          <h4 style={{ flex: 1, margin: 0 }}>📰 {label.toUpperCase()} · {dateText}</h4>
          <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label="Day" value={day} onChange={(e) => setDay(e.target.value as Day)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This week</option>
            <option value="lastweek">Last week</option>
          </select>
          <button className="px-btn small primary" onClick={() => navigator.clipboard?.writeText(asText()).then(() => toast(isWeek(day) ? "Copied for your weekly update." : "Copied for your stand-up."))}>
            ⧉ Copy as text
          </button>
          <button
            className="px-btn small"
            title="Save the report as a Markdown file"
            onClick={() => {
              // Local calendar date (toISOString would shift local midnight to the previous UTC day).
              const d0 = new Date(range[0]);
              const date = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
              const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              download(`${slug}-${isWeek(day) ? "week" : "day"}-${date}.md`, toMarkdown(asText()));
            }}
          >
            ⬇ .md
          </button>
        </div>
        <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>
          <span className="stat-chip">✔ {report.done.length} done</span>
          <span className="stat-chip">⌨ {report.doing.length} in progress</span>
          <span className="stat-chip">🔍 {report.review.length} in review</span>
          <span className="stat-chip" style={report.blocked.length ? { color: "var(--bad)" } : undefined}>⛔ {report.blocked.length} blocked</span>
          <span className="stat-chip" style={attention.length ? { color: "var(--bad)" } : undefined}>☎ {attention.length} waiting on you</span>
          <span className="stat-chip">📌 {report.created.length} new</span>
          <span className="stat-chip">🕒 {report.shifts.length} shifts{report.failed.length ? ` (${report.failed.length} failed)` : ""}</span>
          <span className="stat-chip" title={isWeek(day) ? "Tokens used in this period" : "Tokens used in the last 24 hours"}>🪙 {usageText}</span>
        </div>
        {report.perDay.length > 0 && (
          <div className="week-bars" aria-label="Tasks done per day">
            {report.perDay.map((d, i) => {
              const max = Math.max(1, ...report.perDay.map((x) => x.done));
              return (
                <div key={i} className="week-bar" title={`${d.label}: ${d.done} done`}>
                  <div className="fill" style={{ height: `${(d.done / max) * 100}%` }} />
                  <small>{d.done || ""}</small>
                  <small className="muted">{d.label}</small>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {attention.length > 0 && (
        <div className="px-card" style={{ borderLeft: "8px solid var(--bad)" }}>
          <h4>☎ WAITING ON YOU <span className="muted">{attention.length}</span></h4>
          {attention.map((a) => (
            <button key={`${a.sourceKind}:${a.subject.id}`} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "room", room: "ceo" })}>
              {a.subject.identifier ? `${a.subject.identifier} · ` : ""}
              {a.subject.title}
              <small style={{ color: "var(--muted)" }}>{a.whyNow}</small>
            </button>
          ))}
        </div>
      )}
      <Section title={`✔ DONE ${label.toUpperCase()}`} items={report.done} tone="var(--good)" />
      {cycle.count > 0 && (
        <div className="px-card">
          <h4>⏱ HOW LONG THINGS TOOK</h4>
          <div style={{ fontSize: 17 }}>
            Typical time from start to done: <b>{fmtDuration(cycle.medianMs)}</b> across {cycle.count} task{cycle.count === 1 ? "" : "s"}.
          </div>
          {cycle.slowest.map(({ issue: i, ms }) => (
            <button key={i.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: i.id })}>
              🐢 {i.identifier} · {i.title}
              <small style={{ color: "var(--muted)" }}>
                {fmtDuration(ms)} · @{who(i)}
              </small>
            </button>
          ))}
        </div>
      )}
      <Section title="⌨ IN PROGRESS" items={report.doing} tone="var(--info)" />
      {report.review.length > 0 && <Section title="🔍 READY FOR REVIEW" items={report.review} tone="#C9A7FF" />}
      {report.blocked.length > 0 && <Section title="⛔ BLOCKED" items={report.blocked} tone="var(--bad)" />}

      <div className="px-card">
        <h4>👥 WHO DID WHAT</h4>
        {report.perAgent.length === 0 && <div className="muted">A quiet day: nobody clocked in.</div>}
        {report.perAgent.map(({ agent, done, shifts, now }) => (
          <button key={agent.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "agent", agentId: agent.id })}>
            {agent.name}
            <small style={{ color: "var(--muted)" }}>
              {done} done · {shifts} shifts{now.length ? ` · now on ${now.map((i) => i.identifier).join(", ")}` : ""}
            </small>
          </button>
        ))}
      </div>
    </>
  );
}
