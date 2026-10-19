// A small, safe Markdown renderer for agent-written documents and comments.
// It builds React elements (never raw HTML), and turns Paperclip's own links
// (/PREFIX/issues/KEY, agent://id) into in-office navigation.
import type { ReactNode } from "react";

export interface MdLinks {
  /** Open a task by its identifier (e.g. "YOG-7"). Return false to fall back to a normal link. */
  issue?: (identifier: string) => boolean;
  agent?: (agentId: string) => void;
}

/** Images the office stores itself (task attachments); remote images are never loaded. */
export const isOfficeImage = (src: string) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src);

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(!?\[[^\]]*\]\([^)\s]+\))|(https?:\/\/[^\s)>\]]+)/g;

function inline(text: string, links: MdLinks, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${n++}`;
    const tok = m[0];
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<b key={k}>{inline(tok.slice(2, -2), links, k)}</b>);
    else if (m[3]) out.push(<i key={k}>{inline(tok.slice(1, -1), links, k)}</i>);
    else if (m[4]) {
      const lm = tok.match(/^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (lm && lm[1] && isOfficeImage(lm[3])) out.push(<img key={k} className="md-img" src={lm[3]} alt={lm[2] || "image"} loading="lazy" />);
      else if (lm) out.push(link(lm[3], lm[1] ? `🖼 ${lm[2] || "image"}` : lm[2] || lm[3], links, k));
    } else if (m[5]) out.push(link(tok, tok, links, k));
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function link(href: string, label: string, links: MdLinks, key: string): ReactNode {
  const agent = href.match(/^agent:\/\/([\w-]+)/);
  if (agent && links.agent) {
    return (
      <a key={key} href="#" onClick={(e) => (e.preventDefault(), links.agent?.(agent[1]))}>
        {label}
      </a>
    );
  }
  const issue = href.match(/^\/[A-Z][A-Z0-9]*\/issues\/([A-Z][A-Z0-9]*-\d+)/);
  if (issue && links.issue) {
    return (
      <a key={key} href="#" onClick={(e) => { e.preventDefault(); links.issue?.(issue[1]); }}>
        {label}
      </a>
    );
  }
  if (!/^https?:\/\//.test(href)) return <span key={key}>{label}</span>;
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text, links = {} }: { text: string; links?: MdLinks }) {
  // HTML comments (e.g. the setup scripts' section markers) are notes for machines, not readers.
  const lines = text.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (/^```/.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push(<pre key={k}>{body.join("\n")}</pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = inline(line.replace(/^#+\s*/, ""), links, k);
      blocks.push(level <= 2 ? <h3 key={k}>{content}</h3> : <h4 key={k}>{content}</h4>);
      i++;
    } else if (/^\s*>/.test(line)) {
      const body: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={k}>{inline(body.join(" "), links, k)}</blockquote>);
    } else if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      blocks.push(
        <table key={k}>
          <thead>
            <tr>{head.map((h, j) => <th key={j}>{inline(h, links, `${k}h${j}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, links, `${k}r${ri}c${j}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i++) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "").replace(/^\[( |x)\]\s*/i, (m) => (/x/i.test(m) ? "☑ " : "☐ ")));
        // continuation lines belong to the item
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) items[items.length - 1] += ` ${lines[++i].trim()}`;
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, links, `${k}l${j}`)}</li>);
      blocks.push(ordered ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k} />);
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      const body: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*\||\s*([-*+]|\d+[.)])\s+)/.test(lines[i]); i++) body.push(lines[i]);
      blocks.push(<p key={k}>{inline(body.join(" "), links, k)}</p>);
    }
  }
  return <div className="md">{blocks}</div>;
}
