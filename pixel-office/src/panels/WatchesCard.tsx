import { useState } from "react";
import { useOfficeData } from "../state/officeData";
import { toDef, useWatchActions, useWatches, type Watch } from "../lib/watches";

const ago = (iso: string | null) => {
  if (!iso) return "not yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Saved queries the office re-runs; new matches wait here until brought in or dismissed. */
export function WatchesCard({ onAdd }: { onAdd: (urls: string[]) => void }) {
  const { toast } = useOfficeData();
  const { data: watches, error } = useWatches();
  const { save, run, dismiss } = useWatchActions();
  if (error || !watches?.length) return null;

  const remove = (w: Watch) =>
    confirm(`Stop watching "${w.name}"?`) &&
    save.mutate(watches.filter((x) => x.id !== w.id).map(toDef), { onError: (e) => toast((e as Error).message) });
  const setEvery = (w: Watch, everyMin: number) => save.mutate(watches.map((x) => toDef(x.id === w.id ? { ...x, everyMin } : x)));

  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--accent)" }}>
      <h4>👀 WATCHED</h4>
      {watches.map((w) => (
        <WatchRow
          key={w.id}
          watch={w}
          onAdd={(urls) => {
            onAdd(urls);
            // Once they become tasks the next check drops them; until then hide them here.
            dismiss.mutate({ id: w.id, urls });
          }}
          onDismiss={(urls) => dismiss.mutate({ id: w.id, urls })}
          onRun={() => run.mutate(w.id, { onError: (e) => toast((e as Error).message) })}
          running={run.isPending && run.variables === w.id}
          onRemove={() => remove(w)}
          onEvery={(n) => setEvery(w, n)}
        />
      ))}
    </div>
  );
}

function WatchRow({
  watch: w,
  onAdd,
  onDismiss,
  onRun,
  running,
  onRemove,
  onEvery,
}: {
  watch: Watch;
  onAdd: (urls: string[]) => void;
  onDismiss: (urls: string[]) => void;
  onRun: () => void;
  running: boolean;
  onRemove: () => void;
  onEvery: (n: number) => void;
}) {
  const [shown, setShown] = useState(w.pending.length > 0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const all = w.pending.map((h) => h.url);
  const chosen = picked.size ? [...picked] : all;
  return (
    <div className="question">
      <div className="row" style={{ margin: 0 }}>
        <button className="rpg-option" style={{ flex: 1, margin: 0, color: "var(--ink)" }} onClick={() => setShown((s) => !s)}>
          {w.pending.length ? `🔔 ${w.pending.length} new · ` : ""}
          {w.name}
          <small style={{ color: "var(--muted)" }}>
            checked {ago(w.lastRunAt)} · every{" "}
            <select
              aria-label={`How often to check ${w.name}`}
              value={w.everyMin}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onEvery(Number(e.target.value))}
              style={{ font: "inherit", fontSize: 14 }}
            >
              {[5, 15, 30, 60, 240, 1440].map((n) => (
                <option key={n} value={n}>{n < 60 ? `${n} min` : n === 1440 ? "day" : `${n / 60} h`}</option>
              ))}
            </select>
          </small>
        </button>
        <button className="px-btn small" disabled={running} onClick={onRun} title="Check now">
          {running ? "…" : "↻"}
        </button>
        <button className="px-btn small" onClick={onRemove} aria-label={`Stop watching ${w.name}`}>
          🗑
        </button>
      </div>
      {w.lastError && (
        <small style={{ display: "block", color: "var(--bad)", fontSize: 15 }}>
          ⚠ {w.lastError}
          {w.lastFix ? ` Fix: ${w.lastFix}` : ""}
        </small>
      )}
      {shown && w.pending.length === 0 && !w.lastError && <div className="muted" style={{ fontSize: 15 }}>Nothing new. Matches that are already tasks are skipped.</div>}
      {shown && w.pending.length > 0 && (
        <>
          <div className="query-hits">
            {w.pending.map((h) => (
              <label key={h.url} className="row" style={{ alignItems: "flex-start", margin: "3px 0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={picked.has(h.url)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(h.url)) n.delete(h.url);
                      else n.add(h.url);
                      return n;
                    })
                  }
                />
                <span style={{ flex: 1, fontSize: 16 }}>
                  <b>{h.key}</b> {h.title}
                  <small className="muted" style={{ display: "block", fontSize: 14 }}>{[h.type, h.state, h.assignee && `@${h.assignee}`].filter(Boolean).join(" · ")}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="row">
            <button className="px-btn small primary" onClick={() => onAdd(chosen.slice(0, 50))}>
              ➕ Put {picked.size || Math.min(50, all.length)} on the desk
            </button>
            <button className="px-btn small" onClick={() => onDismiss(chosen)}>
              Dismiss {picked.size || "all"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
