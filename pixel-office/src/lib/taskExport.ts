import type { Attachment, Issue, IssueComment, IssueDocument, WorkProduct } from "../api/types";
import { extractSources } from "./links";

export interface TaskBundle {
  issue: Issue;
  comments: IssueComment[];
  documents: IssueDocument[];
  products: WorkProduct[];
  attachments: Attachment[];
}

/** Paperclip's in-app links read badly outside it: keep the label, drop the target. */
const tidyLinks = (md: string) => md.replace(/\[([^\]]+)\]\((?:agent:\/\/[\w-]+|\/[A-Z][A-Z0-9]*\/issues\/[^)]+)\)/g, "$1");

/** Push headings inside embedded text down, so they nest under the export's own sections (code blocks untouched). */
export function demote(md: string, by = 2): string {
  let fenced = false;
  return md
    .split("\n")
    .map((l) => {
      if (/^\s*```/.test(l)) {
        fenced = !fenced;
        return l;
      }
      if (fenced) return l;
      const m = l.match(/^(#{1,6})\s/);
      return m ? `${"#".repeat(Math.min(6, m[1].length + by))}${l.slice(m[1].length)}` : l;
    })
    .join("\n");
}

const embed = (md: string) => demote(tidyLinks(md.trim()));

/** A task as one self-contained Markdown document, for ADO, email or a wiki. */
export function taskMarkdown(b: TaskBundle, name: (agentId: string | null) => string | undefined, when = (iso: string) => new Date(iso).toLocaleString()): string {
  const { issue: i } = b;
  const out: string[] = [];
  out.push(`# ${i.identifier}: ${i.title}`, "");
  out.push(
    `| | |`,
    `|---|---|`,
    `| Status | ${i.status.replace("_", " ")} |`,
    `| Priority | ${i.priority} |`,
    `| Assignee | ${name(i.assigneeAgentId) ?? "unassigned"} |`,
    `| Created | ${when(i.createdAt)} |`,
    ...(i.completedAt ? [`| Done | ${when(i.completedAt)} |`] : []),
  );
  const sources = extractSources(i.description);
  if (sources.length) out.push(`| Source | ${sources.map((s) => `[${s.key}](${s.url})`).join(", ")} |`);
  out.push("");
  if (i.description?.trim()) out.push("## Details", "", embed(i.description), "");
  if (b.products.length) {
    out.push("## Work products", "");
    for (const w of b.products) out.push(`- ${w.url ? `[${w.title}](${w.url})` : w.title} (${w.type.replace("_", " ")}, ${w.status.replace(/_/g, " ")})${w.summary ? `: ${w.summary}` : ""}`);
    out.push("");
  }
  for (const d of b.documents) out.push(`## Document: ${d.title || d.key}`, "", embed(d.body), "");
  if (b.attachments.length) {
    out.push("## Attachments", "");
    for (const a of b.attachments) out.push(`- ${a.originalFilename ?? "file"} (${Math.max(1, Math.round(a.byteSize / 1024))} KB)`);
    out.push("");
  }
  if (b.comments.length) {
    out.push("## Thread", "");
    for (const c of b.comments) {
      const who = c.authorAgentId ? (name(c.authorAgentId) ?? "an employee") : "CEO";
      out.push(`**${who}**, ${when(c.createdAt)}:`, "", embed(c.body), "");
    }
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
