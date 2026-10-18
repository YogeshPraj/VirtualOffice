import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { brainApi, brainKeys, useBrainStatus, useRecentMemories, type Memory, type MemoryKind } from "../api/brain";
import { keys, useCompanySkills } from "../api/hooks";
import { useOfficeData } from "../state/officeData";

/** What the CEO picks → how the brain stores it. */
const CAPTURE_TYPES: { id: string; label: string; kind: MemoryKind; hint: string; needsEntity?: boolean }[] = [
  { id: "style", label: "🧭 How I work", kind: "preference", hint: "e.g. I want a plan comment before anything bigger than a day of work." },
  { id: "decision", label: "⚖ Decision", kind: "commitment", hint: "e.g. The API stays on .NET 10; no new frameworks without asking me." },
  { id: "asset", label: "🗄 Asset", kind: "fact", hint: "e.g. ADO project 'Ops' tracks production incidents.", needsEntity: true },
  { id: "note", label: "📝 Note", kind: "fact", hint: "Anything the team should know." },
  { id: "idea", label: "💡 Idea", kind: "idea", hint: "Something to explore later. Not an instruction." },
];

const KIND_ICON: Record<string, string> = { preference: "🧭", commitment: "⚖", fact: "📝", idea: "💡", event: "📅", belief: "🤔" };

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="row" role="tablist" style={{ marginBottom: 6 }}>
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} className={`px-btn small ${value === id ? "primary" : ""}`} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function StudyPanel() {
  const [tab, setTab] = useState<"capture" | "memory" | "handbook">("capture");
  const status = useBrainStatus();
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        What you write here is what your company knows. Every employee reads the handbook at the start of each task and
        checks the brain before working.{" "}
        <span style={{ color: status.data?.ok ? "var(--good)" : "var(--bad)" }}>
          {status.isLoading ? "…" : status.data?.ok ? "● Brain online" : "● Brain offline"}
        </span>
      </p>
      {status.error && <div className="px-card" style={{ borderLeft: "8px solid var(--bad)" }}>{(status.error as Error).message}</div>}
      <Tabs
        tabs={[
          ["capture", "✍ Capture"],
          ["memory", "🧠 Memory"],
          ["handbook", "📖 Handbook"],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "capture" && <Capture />}
      {tab === "memory" && <MemoryBrowser />}
      {tab === "handbook" && <HandbookEditor />}
    </>
  );
}

function Capture() {
  const { toast, company } = useOfficeData();
  const qc = useQueryClient();
  const [type, setType] = useState(CAPTURE_TYPES[0].id);
  const [text, setText] = useState("");
  const [entity, setEntity] = useState("");
  const t = CAPTURE_TYPES.find((c) => c.id === type)!;

  const save = useMutation({
    mutationFn: () =>
      brainApi.remember({
        fact: text.trim(),
        kind: t.kind,
        entity: entity.trim() || (t.id === "style" ? "CEO" : company.name),
        provenance: `CEO, pixel office (${t.label.replace(/^\S+\s/, "")})`,
      }),
    onSuccess: (r) => {
      toast(r.status === "duplicate" ? "Already known. Nothing new saved." : "Filed in the brain.");
      setText("");
      qc.invalidateQueries({ queryKey: brainKeys.recent });
    },
  });

  return (
    <div className="px-card">
      <h4>WHAT SHOULD THE COMPANY KNOW?</h4>
      <div className="row" style={{ marginBottom: 8 }}>
        {CAPTURE_TYPES.map((c) => (
          <button key={c.id} className={`px-btn small ${type === c.id ? "primary" : ""}`} onClick={() => setType(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        className="px-textarea"
        aria-label="What to remember"
        placeholder={t.hint}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim() && save.mutate()}
      />
      <label className="px-label" htmlFor="cap-entity">
        ABOUT {t.needsEntity ? "(ASSET NAME)" : "(OPTIONAL: PERSON, REPO, PROJECT…)"}
      </label>
      <input
        id="cap-entity"
        className="px-input"
        placeholder={t.needsEntity ? "e.g. Ops" : t.id === "style" ? "CEO" : company.name}
        value={entity}
        onChange={(e) => setEntity(e.target.value)}
      />
      <div className="row">
        <button className="px-btn primary" disabled={!text.trim() || (t.needsEntity && !entity.trim()) || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Filing…" : "📥 Remember this"}
        </button>
        <span className="muted" style={{ fontSize: 16 }}>Ctrl+Enter saves · one fact per entry · never secrets (use the Vault)</span>
      </div>
    </div>
  );
}

function MemoryBrowser() {
  const qc = useQueryClient();
  const recent = useRecentMemories();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [kind, setKind] = useState<string>("all");
  const search = useQuery({ queryKey: ["brain", "ask", asked], queryFn: () => brainApi.ask(asked), enabled: !!asked, retry: false });
  const forget = useMutation({
    mutationFn: (id: Memory["id"]) => brainApi.forget(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brainKeys.recent });
      qc.invalidateQueries({ queryKey: ["brain", "ask"] });
    },
  });

  const list = (asked ? search.data : recent.data) ?? [];
  const shown = useMemo(() => list.filter((m) => !m.expired_at && !(m.valid_until && new Date(m.valid_until) < new Date()) && (kind === "all" || m.kind === kind)), [list, kind]);
  const loading = asked ? search.isLoading : recent.isLoading;
  const error = (asked ? search.error : recent.error) as Error | null;

  return (
    <>
      <div className="row">
        <input
          className="px-input"
          style={{ flex: 1, margin: 0 }}
          aria-label="Ask the brain"
          placeholder="Ask: what did I decide about caching?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setAsked(q.trim())}
        />
        <button className="px-btn small primary" onClick={() => setAsked(q.trim())}>Ask</button>
        {asked && (
          <button className="px-btn small" onClick={() => { setAsked(""); setQ(""); }}>Recent</button>
        )}
      </div>
      <div className="row" style={{ margin: "8px 0" }}>
        {["all", "preference", "commitment", "fact", "idea", "event"].map((k) => (
          <button key={k} className={`px-btn small ${kind === k ? "primary" : ""}`} onClick={() => setKind(k)}>
            {k === "all" ? "All" : `${KIND_ICON[k]} ${k}`}
          </button>
        ))}
      </div>
      {loading && <div className="muted">Thinking…</div>}
      {error && <div className="px-card" style={{ borderLeft: "8px solid var(--bad)" }}>{error.message}</div>}
      {!loading && !error && shown.length === 0 && (
        <div className="muted">{asked ? "Nothing relevant remembered yet." : "The brain is empty. Start in the Capture tab."}</div>
      )}
      {shown.map((m) => (
        <div key={m.id} className="px-card" style={{ margin: "8px 3px" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span title={m.kind} style={{ fontSize: 20 }}>{KIND_ICON[m.kind] ?? "•"}</span>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{m.fact}</span>
            <button
              className="px-btn small"
              disabled={forget.isPending}
              onClick={() => confirm("Forget this? Employees will stop seeing it.") && forget.mutate(m.id)}
              aria-label="Forget this memory"
            >
              🗑
            </button>
          </div>
          <div className="muted" style={{ fontSize: 15 }}>
            {m.entity_slug ?? "general"} · {m.source ?? "unknown source"} · {new Date(m.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
          </div>
        </div>
      ))}
    </>
  );
}

function HandbookEditor() {
  const { company, toast } = useOfficeData();
  const qc = useQueryClient();
  const skills = useCompanySkills(company.id);
  const handbook = skills.data?.find((s) => s.slug === "ceo-handbook");
  const file = useQuery({
    queryKey: ["handbook", handbook?.id],
    queryFn: () => api.skillFile(company.id, handbook!.id, "SKILL.md"),
    enabled: !!handbook,
  });
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [file.data?.content]);
  const text = draft ?? file.data?.content ?? "";
  const save = useMutation({
    mutationFn: () => api.saveSkillFile(company.id, handbook!.id, "SKILL.md", text),
    onSuccess: () => {
      toast("Handbook updated. Employees get it on their next task.");
      qc.invalidateQueries({ queryKey: ["handbook", handbook?.id] });
      qc.invalidateQueries({ queryKey: keys.skills(company.id) });
    },
  });

  if (skills.isLoading) return <div className="muted">Finding the handbook…</div>;
  if (!handbook) {
    return <div className="px-card">No handbook yet. Run <code>python scripts/brain_equip.py</code> after creating the <code>ceo-handbook</code> skill.</div>;
  }
  return (
    <div className="px-card">
      <h4>THE CEO HANDBOOK</h4>
      <p className="muted" style={{ fontSize: 17, marginTop: 0 }}>
        Short, always-true rules: how you work, your assets, the house rules. Every employee loads this at the start of every
        task, so keep it tight. Put one-off facts and decisions in Capture instead.
      </p>
      <textarea
        className="px-textarea"
        aria-label="Handbook"
        style={{ minHeight: 360, fontFamily: "monospace", fontSize: 15 }}
        value={text}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="row">
        <button className="px-btn primary" disabled={draft === null || !text.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "💾 Save handbook"}
        </button>
        {draft !== null && (
          <button className="px-btn small" onClick={() => setDraft(null)}>Discard changes</button>
        )}
        <span className="muted" style={{ fontSize: 16 }}>{text.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
