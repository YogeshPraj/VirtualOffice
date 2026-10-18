// Recognise the outside work a task is about: Azure DevOps work items and GitHub issues/PRs.
// Same URL shapes as the intake bridge (../../intake-bridge.ts).

export interface SourceLink {
  url: string;
  source: "ado" | "github";
  key: string; // "ADO 1234" or "org/repo#12"
  kind: string; // "work item", "issue", "pull request"
}

const ADO = [
  /https:\/\/dev\.azure\.com\/[^/\s]+\/[^/\s]+\/_workitems\/edit\/(\d+)[^\s)>\]]*/gi,
  /https:\/\/[^.\s]+\.visualstudio\.com\/[^/\s]+\/_workitems\/edit\/(\d+)[^\s)>\]]*/gi,
];
const GITHUB = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)[^\s)>\]]*/gi;

/** Linked work items in a task's text, the intake desk's "**Source:**" line first. */
export function extractSources(text: string | null | undefined): SourceLink[] {
  if (!text) return [];
  const found: { at: number; link: SourceLink }[] = [];
  for (const re of ADO) {
    for (const m of text.matchAll(re)) {
      found.push({ at: m.index ?? 0, link: { url: m[0].replace(/[.,;]+$/, ""), source: "ado", key: `ADO ${m[1]}`, kind: "work item" } });
    }
  }
  for (const m of text.matchAll(GITHUB)) {
    found.push({
      at: m.index ?? 0,
      link: { url: m[0].replace(/[.,;]+$/, ""), source: "github", key: `${m[1]}/${m[2]}#${m[4]}`, kind: m[3] === "pull" ? "pull request" : "issue" },
    });
  }
  const sourceLine = text.match(/\*\*Source:\*\*\s*(\S+)/)?.[1];
  found.sort((a, b) => (a.link.url === sourceLine ? -1 : b.link.url === sourceLine ? 1 : a.at - b.at));
  const seen = new Set<string>();
  return found.map((f) => f.link).filter((l) => !seen.has(l.key) && seen.add(l.key));
}

export const SOURCE_ICON: Record<SourceLink["source"], string> = { ado: "🔷", github: "🐙" };
