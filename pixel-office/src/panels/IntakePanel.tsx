import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useProjects } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { QueryIntake } from "./QueryIntake";
import { fill, resolveAssignee, useTemplates } from "../lib/templates";

/** Mirrors IntakeItem in ../../intake-bridge.ts (server side). */
interface IntakeItem {
  url: string;
  source: "ado" | "github" | "link";
  key: string;
  title: string;
  type?: string;
  state?: string;
  body?: string;
  fields?: Record<string, string>;
  error?: string;
  fix?: string;
}

const SOURCE_ICON: Record<IntakeItem["source"], string> = { ado: "🔷", github: "🐙", link: "🔗" };
const PRIORITIES = ["critical", "high", "medium", "low"] as const;

async function resolve(text: string): Promise<{ items: IntakeItem[]; ignored: string[] }> {
  const res = await fetch("/office-admin/intake/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Lookup failed (${res.status})`);
  return data as { items: IntakeItem[]; ignored: string[] };
}

function itemMarkdown(item: IntakeItem): string {
  const rows = Object.entries(item.fields ?? {}).map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "\\|")} |`);
  return [
    `**Source:** ${item.url}`,
    rows.length ? `\n| Field | Value |\n|---|---|\n${rows.join("\n")}` : "",
    item.body ? `\n${item.body}` : "",
    item.error ? `\n> Details couldn't be fetched (${item.error}). Open the link with your own tools.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function taskTitle(item: IntakeItem): string {
  if (item.source === "link") return `Look into ${item.url}`.slice(0, 200);
  return `[${item.key}] ${item.title}`.slice(0, 200);
}

/** The intake desk: real work (ADO, GitHub, any link) in, well-described tasks out. */
export function IntakePanel() {
  const { company, agents, issues, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const projects = useProjects(company.id);
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  // Default to the team lead (nobody above them), so the Manager triages and delegates.
  const lead = staff.find((a) => !a.reportsTo && ["general", "pm", "ceo", "cto"].includes(a.role)) ?? staff.find((a) => !a.reportsTo);

  const { data: templates = [] } = useTemplates();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<IntakeItem[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"each" | "one">("each");
  const [groupTitle, setGroupTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const who = assignee || lead?.id || "";
  const activeProjects = (projects.data ?? []).filter((p) => !p.archivedAt);
  const project = projectId || activeProjects.find((p) => p.leadAgentId === lead?.id)?.id || activeProjects[0]?.id || "";

  // A link that already appears in an open task's description is probably already in hand.
  const existing = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues) {
      if (i.status === "cancelled" || !i.description) continue;
      for (const it of items ?? []) if (i.description.includes(it.url)) map.set(it.url, i.identifier);
    }
    return map;
  }, [issues, items]);

  const lookup = useMutation({
    mutationFn: (t: string) => resolve(t),
    onSuccess: (r) => {
      setItems(r.items);
      setSkip(new Set(r.items.filter((it) => issues.some((i) => i.status !== "cancelled" && i.description?.includes(it.url))).map((it) => it.url)));
      if (r.items.length === 0) toast("No links found. Paste one URL per line.");
    },
  });

  const chosen = (items ?? []).filter((it) => !skip.has(it.url));
  const instructions = notes.trim() ? `\n\n---\n**From the CEO:** ${notes.trim()}` : "";
  const footer = "\n\n_Imported at the intake desk. Read the source item before starting; ask the CEO if anything is unclear._";

  const create = useMutation({
    mutationFn: async () => {
      const common = { assigneeAgentId: who || null, projectId: project || null, priority, status: "todo" as const };
      if (mode === "one") {
        const description = chosen.map((it, n) => `## ${n + 1}. ${taskTitle(it)}\n${itemMarkdown(it)}`).join("\n\n") + instructions + footer;
        return [await api.createIssue(company.id, { ...common, title: groupTitle.trim(), description })];
      }
      const out = [];
      for (const it of chosen) out.push(await api.createIssue(company.id, { ...common, title: taskTitle(it), description: itemMarkdown(it) + instructions + footer }));
      return out;
    },
    onSuccess: (created) => {
      toast(`Pinned ${created.map((i) => i.identifier).join(", ")} to the board.`);
      setItems(null);
      setText("");
      setNotes("");
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
      if (created.length === 1) open({ kind: "issue", issueId: created[0].id });
    },
  });

  const fixes = [...new Set((items ?? []).map((it) => it.fix).filter(Boolean))] as string[];
  const canCreate = chosen.length > 0 && (mode === "each" || groupTitle.trim().length > 0) && !create.isPending;

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Paste Azure DevOps work items, GitHub issues or PRs, or any link. Details are fetched with your own sign-ins (az, gh) and
        become tasks the team can start on.
      </p>
      <QueryIntake
        existing={(url) => issues.find((i) => i.status !== "cancelled" && i.description?.includes(url))?.identifier}
        onAdd={(urls) => {
          const next = [text.trim(), ...urls].filter(Boolean).join("\n");
          setText(next);
          lookup.mutate(next);
        }}
      />
      <div className="px-card">
        <h4>WHAT CAME IN?</h4>
        <textarea
          className="px-textarea"
          aria-label="Links, one per line"
          style={{ minHeight: 120, fontSize: 17 }}
          placeholder={"https://dev.azure.com/org/project/_workitems/edit/1234\nhttps://github.com/org/repo/issues/56\nhttps://…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="px-label" htmlFor="intake-notes" style={{ flex: 1 }}>INSTRUCTIONS FOR THE TEAM (OPTIONAL)</label>
          <select
            className="px-select"
            style={{ width: "auto", margin: 0 }}
            aria-label="Use a template"
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (!t) return;
              setNotes(fill(t.description, "the linked item"));
              setPriority(t.priority);
              const who = resolveAssignee(t, agents);
              if (who) setAssignee(who);
            }}
          >
            <option value="">🧩 Template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
        </div>
        <textarea
          id="intake-notes"
          className="px-textarea"
          style={{ minHeight: 60 }}
          placeholder="e.g. Fix these before Friday's release; ask me before changing the API."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button className="px-btn primary" disabled={!text.trim() || lookup.isPending} onClick={() => lookup.mutate(text)}>
          {lookup.isPending ? "Looking up…" : "🔎 Look up"}
        </button>
      </div>

      {items && items.length > 0 && (
        <>
          <div className="px-card">
            <h4>FOUND {items.length}</h4>
            {items.map((it) => {
              const dup = existing.get(it.url);
              return (
                <label key={it.url} className="row" style={{ alignItems: "flex-start", margin: "6px 0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!skip.has(it.url)}
                    onChange={(e) =>
                      setSkip((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.delete(it.url);
                        else n.add(it.url);
                        return n;
                      })
                    }
                    style={{ marginTop: 6 }}
                  />
                  <span style={{ flex: 1 }}>
                    {SOURCE_ICON[it.source]} <b>{it.key}</b> {it.title}
                    <small style={{ display: "block", color: "var(--muted)", fontSize: 15 }}>
                      {[it.type, it.state].filter(Boolean).join(" · ")}
                      {dup ? ` · already in ${dup}` : ""}
                      {it.error ? ` · ⚠ ${it.error}` : ""}
                    </small>
                  </span>
                </label>
              );
            })}
            {fixes.length > 0 && (
              <div style={{ background: "#2a2010", color: "#ffe0a0", padding: 8, fontSize: 16, marginTop: 6 }}>
                To fetch full details next time, run in a terminal: {fixes.map((f) => <code key={f} style={{ display: "block" }}>{f}</code>)}
              </div>
            )}
          </div>

          <div className="px-card">
            <h4>MAKE TASKS</h4>
            <div className="row" style={{ marginBottom: 8 }}>
              <button className={`px-btn small ${mode === "each" ? "primary" : ""}`} onClick={() => setMode("each")}>One task per item</button>
              <button className={`px-btn small ${mode === "one" ? "primary" : ""}`} onClick={() => setMode("one")}>One task for all</button>
            </div>
            {mode === "one" && (
              <input className="px-input" aria-label="Task title" placeholder="Title, e.g. Sprint 42 bugs" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} />
            )}
            <label className="px-label" htmlFor="intake-who">GIVE IT TO</label>
            <select id="intake-who" className="px-select" value={who} onChange={(e) => setAssignee(e.target.value)}>
              {lead && <option value={lead.id}>{lead.name} (team lead: triage and delegate)</option>}
              {staff.filter((a) => a.id !== lead?.id).map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.title ?? a.role}</option>
              ))}
              <option value="">Nobody yet (stays on the board)</option>
            </select>
            <div className="row">
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="px-label" htmlFor="intake-project">PROJECT</label>
                <select id="intake-project" className="px-select" value={project} onChange={(e) => setProjectId(e.target.value)}>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="px-label" htmlFor="intake-priority">PRIORITY</label>
                <select id="intake-priority" className="px-select" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="px-btn good" disabled={!canCreate} onClick={() => create.mutate()}>
              {create.isPending ? "Pinning…" : mode === "one" ? "📌 Create 1 task" : `📌 Create ${chosen.length} task${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
