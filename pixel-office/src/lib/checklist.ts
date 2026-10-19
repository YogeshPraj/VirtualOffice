/** Count Markdown checklist items ("- [ ]", "* [x]", "1. [ ]") outside code blocks. */
export function checklist(md: string | null | undefined): { done: number; total: number } {
  let done = 0;
  let total = 0;
  let fenced = false;
  for (const line of (md ?? "").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+\S/);
    if (!m) continue;
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}
