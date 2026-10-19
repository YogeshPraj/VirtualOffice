import type { Panel } from "../state/officeStore";

const KEY = "pixel-office:recent";
const MAX = 8;

/** "issue:<id>", "room:<id>" or "agent:<id>": the palette's command id for a panel. */
export function panelKey(p: Panel): string | null {
  if (!p) return null;
  return p.kind === "issue" ? `issue:${p.issueId}` : p.kind === "agent" ? `agent:${p.agentId}` : `room:${p.room}`;
}

/** Newest first, no repeats, at most `max`. */
export function pushRecent(list: string[], key: string, max = MAX): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max);
}

export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberPanel(p: Panel) {
  const key = panelKey(p);
  if (!key) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pushRecent(readRecent(), key)));
  } catch {
    // Private window or storage full: recents are a convenience.
  }
}
