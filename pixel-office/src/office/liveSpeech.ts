import { useSyncExternalStore } from "react";
import { RUN_LOG_EVENT } from "../api/hooks";
import { RunLogParser, type RunLine } from "../lib/runLog";

/** How long a line from a run stays in the employee's speech bubble. */
export const LIVE_MS = 12_000;

interface Live {
  text: string;
  at: number;
}

/** Turn a run transcript line into a short bubble ("» npm test", "Checking the router…"); null to skip. */
export function bubbleText(line: Pick<RunLine, "kind" | "text">): string | null {
  const t = line.text.replace(/\s+/g, " ").replace(/[#*_`>]/g, "").trim();
  if (!t) return null;
  if (line.kind === "say") return t;
  if (line.kind === "tool") return `» ${t}`;
  if (line.kind === "err") return `⚠ ${t}`;
  return null; // thinking and raw output are too noisy for a bubble
}

const latest = new Map<string, Live>();
const parsers = new Map<string, RunLogParser>();
const listeners = new Set<() => void>();
let snapshot: Record<string, string> = {};
let listening = false;

function rebuild() {
  const now = Date.now();
  const next: Record<string, string> = {};
  for (const [agentId, l] of latest) if (now - l.at < LIVE_MS) next[agentId] = l.text;
  if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
    snapshot = next;
    listeners.forEach((f) => f());
  }
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener(RUN_LOG_EVENT, (e) => {
    const p = (e as CustomEvent<{ runId: string; agentId: string; stream: string; chunk: string; ts: string; seq?: number }>).detail;
    if (!p?.runId || !p.agentId) return;
    let parser = parsers.get(p.runId);
    if (!parser) {
      parser = new RunLogParser();
      parsers.set(p.runId, parser);
      if (parsers.size > 30) parsers.delete(parsers.keys().next().value!);
    }
    const lines = parser.push(p);
    for (let i = lines.length - 1; i >= 0; i--) {
      const text = bubbleText(lines[i]);
      if (text) {
        latest.set(p.agentId, { text, at: Date.now() });
        break;
      }
    }
    rebuild();
  });
  // Let bubbles fade out on their own.
  setInterval(rebuild, 2000);
}

/** agentId -> what they're doing right now, from their live run output. */
export function useLiveSpeech(): Record<string, string> {
  listen();
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => snapshot,
  );
}
