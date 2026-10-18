import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { RUN_LOG_EVENT } from "../api/hooks";
import type { Agent } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { RunLogParser, type LineKind, type RunLine } from "../lib/runLog";

const MAX_LINES = 400;

// Colours tuned for the dark "screen" background.
const KIND_STYLE: Record<LineKind, { icon: string; color?: string; italic?: boolean }> = {
  say: { icon: "💬" },
  think: { icon: "💭", color: "#9aa7b4", italic: true },
  tool: { icon: "🔧", color: "#8fd3ff" },
  out: { icon: "↳", color: "#a0aab5" },
  err: { icon: "⚠", color: "#ff8a8a" },
  done: { icon: "✔", color: "#9be59b" },
};

interface LogPayload {
  runId: string;
  stream: string;
  chunk: string;
  ts: string;
  seq?: number;
}

/** Watch an employee's live run (or replay their last shift) as a readable transcript. */
export function OverShoulder({ agent }: { agent: Agent }) {
  const { company, issues } = useOfficeData();
  const open = useOffice((s) => s.open);
  const working = agent.status === "running";
  const [shown, setShown] = useState(working);
  const [thinking, setThinking] = useState(false);
  const [lines, setLines] = useState<RunLine[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (working) setShown(true);
  }, [working]);

  const { data: runs } = useQuery({
    queryKey: ["agent-runs", agent.id, agent.status],
    queryFn: () => api.agentRuns(company.id, agent.id),
    enabled: shown,
  });
  const run = runs?.[0];

  useEffect(() => {
    if (!shown || !run) return;
    const parser = new RunLogParser();
    const early: LogPayload[] = [];
    let ready = false;
    let stopped = false;
    const add = (more: RunLine[]) => more.length && setLines((l) => [...l, ...more].slice(-MAX_LINES));
    const onLog = (e: Event) => {
      const p = (e as CustomEvent<LogPayload>).detail;
      if (p?.runId !== run.id) return;
      if (ready) add(parser.push(p));
      else early.push(p);
    };
    window.addEventListener(RUN_LOG_EVENT, onLog);
    setLines([]);
    setLoading(true);
    api
      .runLog(run.id, run.logBytes)
      .then((log) => !stopped && setLines(parser.pushStored(log).slice(-MAX_LINES)))
      .catch(() => {
        /* no stored log yet: the live stream fills it in */
      })
      .finally(() => {
        if (stopped) return;
        ready = true;
        setLoading(false);
        add(early.flatMap((p) => parser.push(p)));
      });
    return () => {
      stopped = true;
      window.removeEventListener(RUN_LOG_EVENT, onLog);
    };
  }, [shown, run?.id]);

  // Follow new lines unless the CEO scrolled up to read.
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, thinking]);

  const isLive = run?.status === "running" || run?.status === "queued";
  const issueId = run?.contextSnapshot?.issueId;
  const issue = issueId ? issues.find((i) => i.id === issueId) : undefined;
  const visible = thinking ? lines : lines.filter((l) => l.kind !== "think");

  return (
    <div className="px-card" style={{ borderLeft: `8px solid ${isLive ? "var(--good)" : "var(--muted)"}` }}>
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>👀 OVER THE SHOULDER {isLive && <span className="tag running">LIVE</span>}</h4>
        <button className="px-btn small" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : working ? "Watch" : "Replay last shift"}
        </button>
      </div>
      {shown && (
        <>
          {!run && <div className="muted">{runs ? "They haven't worked a shift yet." : "Finding their desk…"}</div>}
          {run && (
            <div className="muted row" style={{ fontSize: 16, margin: "4px 0" }}>
              <span style={{ flex: 1 }}>
                {isLive ? "Working now" : `Last shift ${run.status.replace("_", " ")}`}
                {run.startedAt ? ` · started ${new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                {issue && (
                  <>
                    {" · on "}
                    <a href="#" onClick={(e) => (e.preventDefault(), open({ kind: "issue", issueId: issue.id }))}>
                      {issue.identifier}
                    </a>
                  </>
                )}
              </span>
              <label style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)} /> thinking
              </label>
            </div>
          )}
          {run && (
            <div
              ref={box}
              className="shoulder-log"
              role="log"
              aria-live="polite"
              aria-label={`${agent.name}'s run output`}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
              }}
            >
              {loading && <div className="muted">Pulling up the screen…</div>}
              {!loading && visible.length === 0 && <div className="muted">{isLive ? "Getting started…" : "Nothing readable in this shift's output."}</div>}
              {visible.map((l, i) => {
                const k = KIND_STYLE[l.kind];
                return (
                  <div key={i} style={{ color: k.color, fontStyle: k.italic ? "italic" : undefined }}>
                    <span className="muted">{new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> {k.icon} {l.text}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
