import { useState } from "react";
import { useOfficeData } from "../state/officeData";
import { DEFAULT_TEMPLATES, useSaveTemplates, useTemplates, type TaskTemplate } from "../lib/templates";

const ROLES = ["lead", "engineer", "qa", "designer", "pm", "researcher", "devops", "security"];

/** Edit the office's task templates. */
export function TemplateEditor({ onClose }: { onClose: () => void }) {
  const { agents, toast } = useOfficeData();
  const { data: templates = DEFAULT_TEMPLATES } = useTemplates();
  const save = useSaveTemplates();
  const [list, setList] = useState<TaskTemplate[]>(templates);
  const [openId, setOpenId] = useState<string | null>(null);
  const staff = agents.filter((a) => a.status !== "terminated");
  const set = (id: string, patch: Partial<TaskTemplate>) => setList((l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const add = () => {
    const t: TaskTemplate = { id: `t${Date.now().toString(36)}`, icon: "📌", name: "New template", title: "{what}", description: "", priority: "medium", assignee: "lead" };
    setList((l) => [...l, t]);
    setOpenId(t.id);
  };

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🧩 TASK TEMPLATES</h4>
        <button className="px-btn small" onClick={onClose}>Close</button>
      </div>
      <div className="muted" style={{ fontSize: 15, margin: "4px 0" }}>
        Use <code>{"{what}"}</code> where the specifics go. Templates are shared by everyone using this office.
      </div>
      {list.map((t) => (
        <div key={t.id} className="question">
          <div className="row" style={{ margin: 0 }}>
            <button className="rpg-option" style={{ flex: 1, color: "var(--ink)", margin: 0 }} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
              {t.icon} {t.name}
              <small style={{ color: "var(--muted)" }}>
                {t.priority} · {staff.find((a) => a.id === t.assignee)?.name ?? t.assignee}
              </small>
            </button>
            <button className="px-btn small" aria-label={`Delete ${t.name}`} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
              🗑
            </button>
          </div>
          {openId === t.id && (
            <div>
              <div className="row">
                <input className="px-input" style={{ width: 56, margin: 0 }} aria-label="Icon" value={t.icon} onChange={(e) => set(t.id, { icon: e.target.value.slice(0, 4) })} />
                <input className="px-input" style={{ flex: 1, margin: 0 }} aria-label="Template name" value={t.name} onChange={(e) => set(t.id, { name: e.target.value })} />
              </div>
              <input className="px-input" aria-label="Title pattern" value={t.title} onChange={(e) => set(t.id, { title: e.target.value })} />
              <textarea className="px-textarea" aria-label="Details pattern" style={{ minHeight: 120, fontSize: 16 }} value={t.description} onChange={(e) => set(t.id, { description: e.target.value })} />
              <div className="row">
                <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Priority" value={t.priority} onChange={(e) => set(t.id, { priority: e.target.value as TaskTemplate["priority"] })}>
                  {["critical", "high", "medium", "low"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select className="px-select" style={{ flex: 1, margin: 0 }} aria-label="Assign to" value={t.assignee} onChange={(e) => set(t.id, { assignee: e.target.value })}>
                  <optgroup label="By role">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r === "lead" ? "Team lead" : `Any ${r}`}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Person">
                    {staff.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="row">
        <button className="px-btn small" onClick={add}>+ Add template</button>
        <button className="px-btn small" onClick={() => confirm("Put back the built-in templates? Your edits are lost.") && setList(DEFAULT_TEMPLATES)}>
          Reset
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="px-btn small primary"
          disabled={save.isPending || JSON.stringify(list) === JSON.stringify(templates)}
          onClick={() => save.mutate(list.filter((t) => t.name.trim()), { onSuccess: () => toast("Templates saved."), onError: (e) => toast((e as Error).message) })}
        >
          Save templates
        </button>
      </div>
    </div>
  );
}
