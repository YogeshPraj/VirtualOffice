import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AttentionItem, HeartbeatRun, Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { pendingTotal, useWatches } from "../lib/watches";
import { firstVisitToday, MorningBriefing } from "./MorningBriefing";

const LAST_SEEN = "pixel-office:last-seen";
const BASELINE = "pixel-office:since";
const DISMISSED = "pixel-office:since-dismissed";
export const AWAY_MS = 2 * 3_600_000;

const read = (store: Storage, key: string) => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};
const write = (store: Storage, key: string, v: string) => {
  try {
    store.setItem(key, v);
  } catch {
    /* storage blocked */
  }
};

/**
 * When the CEO last had the office open, as of this visit. Reloads within the same visit keep the
 * same baseline, so the briefing and the board's glow don't vanish on refresh.
 */
export function awayBaseline(): number | null {
  const kept = read(sessionStorage, BASELINE);
  if (kept) return Number(kept) || null;
  const last = read(localStorage, LAST_SEEN);
  write(sessionStorage, BASELINE, last ?? "0");
  return last ? Number(last) || null : null;
}

/** Keep "last seen" fresh while the office is actually on screen. */
function useLastSeenHeartbeat() {
  useEffect(() => {
    const beat = () => document.visibilityState === "visible" && write(localStorage, LAST_SEEN, String(Date.now()));
    beat();
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
}

export interface Briefing {
  done: Issue[];
  created: Issue[];
  review: Issue[];
  waiting: AttentionItem[];
  failed: HeartbeatRun[];
}

/** What changed since `since`. */
export function briefing(since: number, issues: Issue[], attention: AttentionItem[], runs: HeartbeatRun[]): Briefing {
  const after = (iso: string | null | undefined) => !!iso && Date.parse(iso) > since;
  const real = issues.filter((i) => !i.hiddenAt && i.workMode !== "ask");
  return {
    done: real.filter((i) => i.status === "done" && after(i.completedAt ?? i.updatedAt)),
    created: real.filter((i) => after(i.createdAt)),
    review: real.filter((i) => i.status === "in_review" && after(i.updatedAt)),
    waiting: attention.filter((a) => after(a.createdAt)),
    failed: runs.filter((r) => (r.status === "failed" || r.status === "timed_out") && after(r.finishedAt ?? r.startedAt) && !/blocked by unresolved blockers/i.test(r.error ?? "")),
  };
}

const ago = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(ms / 86_400_000);
  return `${d} day${d === 1 ? "" : "s"}`;
};

/** The "since you were away" briefing, shown once per visit after a long enough absence. */
export function SinceAway() {
  useLastSeenHeartbeat();
  const { company, issues, attention, agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const [since] = useState(awayBaseline);
  const [dismissed, setDismissed] = useState(() => read(sessionStorage, DISMISSED) === "1");
  // The first visit of a new day always gets the welcome, with the morning briefing on top.
  const morning = firstVisitToday(since);
  const away = since !== null && (Date.now() - since > AWAY_MS || morning);
  const { data: runs } = useQuery({ queryKey: ["runs-recent", company.id, 500], queryFn: () => api.recentRuns(company.id, 500), enabled: away && !dismissed });
  const { data: watches } = useWatches();
  const b = useMemo(() => (since && runs ? briefing(since, issues, attention, runs) : null), [since, issues, attention, runs]);

  if (!away || dismissed || !b) return null;
  const close = () => {
    write(sessionStorage, DISMISSED, "1");
    setDismissed(true);
  };
  const newWork = pendingTotal(watches);
  const nothing = !b.done.length && !b.created.length && !b.review.length && !b.waiting.length && !b.failed.length && !newWork;
  const go = (f: () => void) => () => {
    close();
    f();
  };
  const Row = ({ icon, label, n, onClick }: { icon: string; label: string; n: number; onClick: () => void }) =>
    n > 0 ? (
      <button className="rpg-option" style={{ color: "var(--ink)" }} onClick={go(onClick)}>
        {icon} {n} {label}
      </button>
    ) : null;

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label="Since you were away" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row">
          <h4 style={{ flex: 1, margin: 0 }}>{morning ? "☀ GOOD MORNING" : "☕ WELCOME BACK"}</h4>
          <button className="px-btn small" onClick={close} autoFocus>
            Got it
          </button>
        </div>
        <div className="muted" style={{ fontSize: 16, margin: "4px 0 8px" }}>
          You were away {ago(Date.now() - since!)}. {nothing ? "It was quiet: nothing needs you." : "Here's what happened:"}
        </div>
        {morning && <MorningBriefing since={since!} onOpenItem={close} />}
        <Row icon="☎" n={b.waiting.length} label={`new thing${b.waiting.length === 1 ? "" : "s"} waiting on you`} onClick={() => open({ kind: "room", room: "ceo" })} />
        <Row icon="🔍" n={b.review.length} label={`task${b.review.length === 1 ? "" : "s"} ready for review`} onClick={() => open({ kind: "room", room: "meeting" })} />
        <Row icon="⚠" n={b.failed.length} label={`failed shift${b.failed.length === 1 ? "" : "s"}${b.failed.length ? ` (${[...new Set(b.failed.map((r) => agentById(r.agentId)?.name ?? "someone"))].join(", ")})` : ""}`} onClick={() => open({ kind: "room", room: "status" })} />
        <Row icon="📥" n={newWork} label="new items from watched queries" onClick={() => open({ kind: "room", room: "intake" })} />
        <Row icon="✔" n={b.done.length} label={`task${b.done.length === 1 ? "" : "s"} finished`} onClick={() => open({ kind: "room", room: "report" })} />
        <Row icon="📌" n={b.created.length} label={`new task${b.created.length === 1 ? "" : "s"}`} onClick={() => open({ kind: "room", room: "meeting" })} />
        {b.done.slice(0, 5).map((i) => (
          <div key={i.id} className="muted" style={{ fontSize: 15, marginLeft: 24 }}>
            ✔ {i.identifier} {i.title}
          </div>
        ))}
        <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>Notes that changed glow on the board for the rest of this visit.</div>
      </div>
    </div>
  );
}
