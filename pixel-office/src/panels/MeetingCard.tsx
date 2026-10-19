import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetHoldSetting } from "../api/client";
import { keys } from "../api/hooks";
import type { Agent, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { notifyCeo } from "../ui/useNotifications";

export type MeetingStatus = "needed" | "running" | "ceo" | "drafting" | "review" | "approved" | "skipped" | "cancelled";
export interface Item {
  title: string;
  owner: string | null;
  after: number[];
  doneWhen: string[];
  notes: string;
}
export interface Meeting {
  featureId: string;
  title: string;
  status: MeetingStatus;
  planned: { status: string; assigneeAgentId: string | null };
  attendees: string[];
  rounds: number;
  round: number;
  turn: number;
  current: { issueId: string; agentId: string; startedAt: string } | null;
  transcript: { who: string | null; name: string; round: number }[];
  proposal: Item[] | null;
  created: string[];
  error: string | null;
}
interface Store {
  holdNewFeatures: boolean;
  meetings: Record<string, Meeting>;
}

export const MEETINGS_KEY = ["meetings"] as const;
export const useMeetings = () =>
  useQuery({ queryKey: MEETINGS_KEY, queryFn: async () => (await (await fetch("/office-admin/meetings")).json()) as Store, refetchInterval: 15_000 });

/** Who should be in the room by default: the planned owner, a manager, and QA. */
export function defaultAttendees(agents: Pick<Agent, "id" | "role" | "status" | "title" | "name">[], plannedOwner: string | null): string[] {
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const isRole = (a: (typeof staff)[number], re: RegExp) => re.test(`${a.role ?? ""} ${a.title ?? ""} ${a.name}`);
  const picks = [
    staff.find((a) => isRole(a, /manager|lead|cto|pm\b/i))?.id,
    plannedOwner ?? undefined,
    staff.find((a) => isRole(a, /\bqa\b|test/i))?.id,
  ].filter((x): x is string => !!x && staff.some((a) => a.id === x));
  const unique = [...new Set(picks)];
  return unique.length ? unique : staff.slice(0, 3).map((a) => a.id);
}

const post = async (featureId: string, step: string, body: unknown = {}) => {
  const r = await fetch(`/office-admin/meetings/${featureId}/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d as Meeting;
};

/** The planning meeting for a feature, on its task panel: start it, follow it, steer it, approve the plan. */
export function MeetingCard({ issue }: { issue: Issue }) {
  const { company, agents, agentById, issues, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data, refetch } = useMeetings();
  const m = data?.meetings[issue.id];
  // A task held a moment ago (or just moved on) shouldn't wait for the next poll.
  useEffect(() => {
    void refetch();
  }, [issue.id, issue.updatedAt, refetch]);
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const [who, setWho] = useState<string[] | null>(null);
  const [rounds, setRounds] = useState(2);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [reopen, setReopen] = useState(false);

  useEffect(() => setItems(m?.proposal ? m.proposal.map((i) => ({ ...i })) : null), [m?.status, m?.proposal?.length]);

  const act = useMutation({
    mutationFn: ({ step, body }: { step: string; body?: unknown }) => post(issue.id, step, body),
    onSuccess: (_m, { step }) => {
      qc.invalidateQueries({ queryKey: MEETINGS_KEY });
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
      qc.invalidateQueries({ queryKey: keys.comments(issue.id) });
      const said: Record<string, string> = {
        start: "Meeting started. Each attendee speaks in turn; you'll be called when it's your turn.",
        skip: "No meeting: the task goes ahead as planned.",
        draft: "Drafted the work items from the meeting. Check them over.",
        approve: "Plan approved: the work items are created and everyone can start.",
        ceo: "Noted.",
      };
      toast(said[step] ?? "Done.");
      setNote("");
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!m || issue.parentId) return null;
  const attendees = who ?? (m.attendees.length ? m.attendees : defaultAttendees(staff, m.planned.assigneeAgentId));
  const name = (id: string | null) => agentById(id)?.name ?? "someone";
  const busy = act.isPending;

  return (
    <div className="px-card meeting-card" aria-label="Planning meeting" style={{ borderLeft: "8px solid #C9A7FF" }}>
      <h4>🗓 PLANNING MEETING</h4>
      {m.error && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠ {m.error}</div>}

      {(m.status === "skipped" || m.status === "cancelled") && !reopen && (
        <div className="row" style={{ margin: 0 }}>
          <span className="muted" style={{ flex: 1, fontSize: 15 }}>{m.status === "skipped" ? "Went ahead without a meeting." : "The meeting was called off."}</span>
          <button className="px-btn small" onClick={() => setReopen(true)}>Hold a meeting after all</button>
        </div>
      )}
      {(m.status === "needed" || ((m.status === "skipped" || m.status === "cancelled") && reopen)) && (
        <>
          <div style={{ fontSize: 16 }}>
            {m.status === "needed"
              ? `Held for planning: nobody starts until the team has met and you've approved the work items. Meant for ${m.planned.assigneeAgentId ? name(m.planned.assigneeAgentId) : "nobody yet"}.`
              : m.status === "skipped"
                ? "You went ahead without a meeting."
                : "The meeting was called off."}
          </div>
          <div className="px-label" style={{ marginTop: 6 }}>WHO'S IN THE ROOM</div>
          <div className="row" style={{ flexWrap: "wrap", margin: 0 }}>
            {staff.map((a) => (
              <label key={a.id} style={{ fontSize: 16, marginRight: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={attendees.includes(a.id)} onChange={(e) => setWho(e.target.checked ? [...attendees, a.id] : attendees.filter((x) => x !== a.id))} /> {a.name}
              </label>
            ))}
          </div>
          <div className="row">
            <select className="px-select" aria-label="Rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} style={{ width: "auto" }}>
              <option value={1}>1 round</option>
              <option value={2}>2 rounds (they respond to each other)</option>
            </select>
            <span className="muted" style={{ fontSize: 14 }}>
              About {attendees.length * rounds} shift{attendees.length * rounds === 1 ? "" : "s"}.
            </span>
          </div>
          <div className="row">
            <button className="px-btn small primary" disabled={busy || !attendees.length} onClick={() => act.mutate({ step: "start", body: { attendees, rounds } })}>
              🗓 Start the meeting
            </button>
            {m.status === "needed" && (
              <button className="px-btn small" disabled={busy} onClick={() => confirm("Go ahead without a planning meeting?") && act.mutate({ step: "skip" })}>
                No meeting needed
              </button>
            )}
          </div>
        </>
      )}

      {m.status === "running" && (
        <>
          <div style={{ fontSize: 16 }}>
            Round {m.round} of {m.rounds}.{" "}
            {m.current ? (
              <>
                <b>{name(m.current.agentId)}</b> has the floor (since {new Date(m.current.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).{" "}
                <button className="link-btn" onClick={() => open({ kind: "agent", agentId: m.current!.agentId })}>
                  Watch them think
                </button>
              </>
            ) : (
              "Calling the next speaker…"
            )}
          </div>
          <div className="meeting-seats" style={{ fontSize: 15, margin: "4px 0" }}>
            {m.attendees.map((id, i) => {
              const spoke = m.transcript.some((l) => l.who === id && l.round === m.round);
              return (
                <span key={id} className={`tag ${m.current?.agentId === id ? "running" : spoke ? "idle" : ""}`} style={{ marginRight: 6 }}>
                  {i + 1}. {name(id)} {spoke ? "✔" : m.current?.agentId === id ? "🗣" : ""}
                </span>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>Everything they say lands in this task's thread below.</div>
          <button className="px-btn small" disabled={busy} onClick={() => confirm("Call off the meeting? The task goes ahead as planned.") && act.mutate({ step: "skip" })}>
            Call it off
          </button>
        </>
      )}

      {m.status === "ceo" && (
        <>
          <div style={{ fontSize: 16 }}>
            The team has had its say ({m.transcript.filter((l) => l.who).length} contributions in {m.round} round{m.round === 1 ? "" : "s"}). Read the thread below, then add your input.
          </div>
          <textarea className="px-textarea" aria-label="Your input to the meeting" placeholder="Decisions, answers to their questions, what you want done differently…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="px-btn small primary" disabled={busy} onClick={async () => {
              if (note.trim()) await post(issue.id, "ceo", { note, again: false }).catch((e: Error) => toast(e.message));
              act.mutate({ step: "draft" });
            }}>
              📝 Draft the work items
            </button>
            <button className="px-btn small" disabled={busy || !note.trim()} onClick={() => act.mutate({ step: "ceo", body: { note, again: true } })} title="They read your input and respond">
              🔁 Another round with my input
            </button>
            <button className="px-btn small" disabled={busy || !note.trim()} onClick={() => act.mutate({ step: "ceo", body: { note, again: false } })}>
              Just add my input
            </button>
          </div>
        </>
      )}

      {m.status === "drafting" && <div className="muted">Writing up the work items from the meeting… (up to a minute)</div>}

      {m.status === "review" && items && (
        <>
          <div style={{ fontSize: 16 }}>The work items from the meeting. Edit anything, then approve: they're created under this task, in this order, and everyone starts.</div>
          {items.map((it, n) => (
            <div key={n} className="doc-view meeting-item" style={{ margin: "6px 0" }}>
              <div className="row" style={{ margin: 0 }}>
                <b>{n + 1}.</b>
                <input className="px-input" style={{ flex: 1, margin: 0 }} aria-label={`Item ${n + 1} title`} value={it.title} onChange={(e) => setItems(items.map((x, i) => (i === n ? { ...x, title: e.target.value } : x)))} />
                <select className="px-select" style={{ width: "auto", margin: 0 }} aria-label={`Item ${n + 1} owner`} value={it.owner ?? ""} onChange={(e) => setItems(items.map((x, i) => (i === n ? { ...x, owner: e.target.value || null } : x)))}>
                  <option value="">Unassigned</option>
                  {staff.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button className="px-btn small" aria-label={`Remove item ${n + 1}`} onClick={() => setItems(items.filter((_, i) => i !== n).map((x) => ({ ...x, after: x.after.filter((a) => a !== n).map((a) => (a > n ? a - 1 : a)) })))}>
                  ×
                </button>
              </div>
              {n > 0 && (
                <div style={{ fontSize: 14, marginTop: 2 }}>
                  Waits on:{" "}
                  {items.slice(0, n).map((_, a) => (
                    <label key={a} style={{ marginRight: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={it.after.includes(a)} onChange={(e) => setItems(items.map((x, i) => (i === n ? { ...x, after: e.target.checked ? [...x.after, a] : x.after.filter((y) => y !== a) } : x)))} /> {a + 1}
                    </label>
                  ))}
                </div>
              )}
              <textarea className="px-textarea" style={{ minHeight: 50, fontSize: 15 }} aria-label={`Item ${n + 1} done when`} value={it.doneWhen.join("\n")} placeholder="Done when… (one check per line)" onChange={(e) => setItems(items.map((x, i) => (i === n ? { ...x, doneWhen: e.target.value.split("\n") } : x)))} />
              {it.notes && <div className="muted" style={{ fontSize: 14 }}>{it.notes}</div>}
            </div>
          ))}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="px-btn small good" disabled={busy || !items.length || items.some((i) => !i.title.trim())} onClick={() => confirm(`Create ${items.length} work item(s) and let the team start?`) && act.mutate({ step: "approve", body: { items: items.map((i) => ({ ...i, doneWhen: i.doneWhen.map((d) => d.trim()).filter(Boolean) })) } })}>
              ✔ Approve the plan
            </button>
            <button className="px-btn small" onClick={() => setItems([...items, { title: "", owner: null, after: [], doneWhen: [], notes: "" }])}>+ Item</button>
            <button className="px-btn small" disabled={busy} onClick={() => act.mutate({ step: "draft" })}>↻ Redraft</button>
          </div>
        </>
      )}

      {m.status === "approved" && (
        <div style={{ fontSize: 16 }}>
          ✅ Planned and approved. Work items:
          {m.created.map((id) => {
            const c = issues.find((i) => i.id === id);
            return (
              <div key={id}>
                <button className="link-btn" onClick={() => open({ kind: "issue", issueId: id })}>
                  {c ? `${c.identifier} ${c.title} · ${c.status.replace("_", " ")} · ${c.assigneeAgentId ? name(c.assigneeAgentId) : "unassigned"}` : "a work item"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tell the CEO when a meeting needs them (after the rounds, or when a plan is ready to approve). */
export function MeetingAlerts() {
  const { toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { data } = useMeetings();
  const seen = useRef<Map<string, MeetingStatus> | null>(null);
  useEffect(() => {
    if (!data) return;
    const now = new Map(Object.values(data.meetings).map((m) => [m.featureId, m.status]));
    if (!seen.current) {
      // Opening the office: mention meetings already waiting for you, once per visit.
      const waiting = Object.values(data.meetings).filter((m) => m.status === "ceo" || m.status === "review");
      let told = false;
      try {
        told = sessionStorage.getItem("pixel-office:meetings-told") === "1";
        sessionStorage.setItem("pixel-office:meetings-told", "1");
      } catch {
        /* tell anyway */
      }
      if (waiting.length && !told) toast(`🗓 ${waiting.length} planning meeting${waiting.length === 1 ? " is" : "s are"} waiting for you: ${waiting.map((m) => `"${m.title}"`).join(", ")}.`);
    }
    if (seen.current) {
      for (const m of Object.values(data.meetings)) {
        const was = seen.current.get(m.featureId);
        if (was === m.status) continue;
        if (m.status === "ceo") {
          toast(`🗓 The team has had its say on "${m.title}". Your turn.`);
          notifyCeo("🗓 Planning meeting: your turn", m.title, () => open({ kind: "issue", issueId: m.featureId }), `meeting-${m.featureId}`);
        } else if (m.status === "review") toast(`🗓 Work items for "${m.title}" are ready for your approval.`);
      }
    }
    seen.current = now;
  }, [data, toast, open]);
  return null;
}

const LABEL: Record<MeetingStatus, string> = {
  needed: "waiting to be planned",
  running: "team is talking",
  ceo: "your turn",
  drafting: "writing up the work items",
  review: "plan ready for your approval",
  approved: "planned",
  skipped: "went ahead without a meeting",
  cancelled: "called off",
};

/** On the task board: the meetings in progress, and the switch for holding new features. */
export function MeetingsBoard() {
  const { toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data } = useMeetings();
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const r = await fetch("/office-admin/meetings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdNewFeatures: on }) });
      if (!r.ok) throw new Error("Couldn't change it.");
      forgetHoldSetting();
      return on;
    },
    onSuccess: (on) => {
      qc.invalidateQueries({ queryKey: MEETINGS_KEY });
      toast(on ? "New features wait for a planning meeting." : "New features start straight away.");
    },
  });
  if (!data) return null;
  const active = Object.values(data.meetings)
    .filter((m) => ["needed", "running", "ceo", "drafting", "review"].includes(m.status))
    .sort((a, b) => Number(["ceo", "review"].includes(b.status)) - Number(["ceo", "review"].includes(a.status)));
  return (
    <div className="px-card" aria-label="Planning meetings">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🗓 PLANNING MEETINGS</h4>
        <label style={{ fontSize: 15, cursor: "pointer" }} title="Every new top-level task is held until the team has planned it">
          <input type="checkbox" checked={data.holdNewFeatures} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} /> Plan every new feature first
        </label>
      </div>
      {!active.length && <div className="muted" style={{ fontSize: 15 }}>No meetings right now.</div>}
      {active.map((m) => (
        <button key={m.featureId} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: m.featureId })}>
          {["ceo", "review"].includes(m.status) ? "☎ " : m.status === "running" ? "🗣 " : "🗓 "}
          {m.title}
          <small style={{ color: "var(--muted)" }}>{LABEL[m.status]}</small>
        </button>
      ))}
    </div>
  );
}
