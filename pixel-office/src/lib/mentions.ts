// @mentions in comments: the CEO types "@Ada", Paperclip stores "[@Ada](agent://<id>)".

export interface Mentionable {
  id: string;
  name: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn plain @Name mentions into Paperclip mention links and list who was mentioned.
 * Longest names match first (so "@Fullstack12" beats "@Fullstack1"); existing links are kept.
 */
export function linkMentions(body: string, people: Mentionable[]): { body: string; ids: string[] } {
  const ids = new Set<string>();
  for (const m of body.matchAll(/\]\(agent:\/\/([\w-]+)\)/g)) ids.add(m[1]);
  const sorted = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  if (!sorted.length) return { body, ids: [...ids] };
  const re = new RegExp(`(^|[^\\w\\[@/])@(${sorted.map((p) => escape(p.name)).join("|")})(?![\\w-])`, "gi");
  const out = body.replace(re, (_all, pre: string, name: string) => {
    const who = sorted.find((p) => p.name.toLowerCase() === name.toLowerCase())!;
    ids.add(who.id);
    return `${pre}[@${who.name}](agent://${who.id})`;
  });
  return { body: out, ids: [...ids] };
}

/** The "@partial" being typed just before the caret, if any. */
export function mentionAtCaret(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[\s(])@([\w-]{0,30})$/);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}
