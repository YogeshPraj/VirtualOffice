/** Markdown checklist items ("- [ ]", "* [x]", "1. [ ]") outside code blocks, in order. */
export function checklistItems(md: string | null | undefined): { text: string; done: boolean }[] {
  const out: { text: string; done: boolean }[] = [];
  let fenced = false;
  for (const line of (md ?? "").split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+(\S.*)$/);
    if (m) out.push({ text: m[2].trim(), done: m[1] !== " " });
  }
  return out;
}

/** Count Markdown checklist items outside code blocks. */
export function checklist(md: string | null | undefined): { done: number; total: number } {
  const items = checklistItems(md);
  return { done: items.filter((i) => i.done).length, total: items.length };
}
