import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { OrgNode, Routine } from "../api/types";
import {
  keys,
  useAdapters,
  useAgentSkills,
  useCompanySkills,
  useOrg,
  useProjects,
  useRoutines,
  useSecrets,
  useSkillCatalog,
  useToolConnections,
  useToolGallery,
} from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { Avatar } from "../ui/Avatar";
import { ClassicLink } from "../ui/Window";
import { ROLE_LABEL } from "./HrPanel";
import { WorkingHoursCard } from "./WorkingHours";

/** Shared mutation wrapper: toast on success/failure, then refresh the given queries. */
function useAction<TArgs>(fn: (args: TArgs) => Promise<unknown>, success: string | ((args: TArgs) => string), refresh: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  const { toast } = useOfficeData();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, args) => {
      toast(typeof success === "function" ? success(args) : success);
      for (const k of refresh) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e: Error) => toast(e.message),
  });
}

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

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "never");

// ── Management office: company settings ────────────────────────────────
export function SettingsPanel() {
  const { company } = useOfficeData();
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description ?? "");
  const [budget, setBudget] = useState(String((company.budgetMonthlyCents ?? 0) / 100));
  const [approval, setApproval] = useState(!!company.requireBoardApprovalForNewAgents);
  const paused = company.status === "paused";

  const save = useAction(
    () =>
      api.updateCompany(company.id, {
        name: name.trim(),
        description: description.trim(),
        budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)),
        requireBoardApprovalForNewAgents: approval,
      }),
    "Paperwork filed.",
    [keys.companies],
  );
  const toggle = useAction(
    () => api.updateCompany(company.id, { status: paused ? "active" : "paused" }),
    paused ? "Doors open again." : "Office closed. Agents won't pick up new work.",
    [keys.companies, keys.agents(company.id)],
  );

  return (
    <>
      <div className="px-card">
        <h4>COMPANY REGISTRATION</h4>
        <label className="px-label" htmlFor="set-name">NAME ON THE SIGN</label>
        <input id="set-name" className="px-input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="px-label" htmlFor="set-desc">WHAT WE DO</label>
        <textarea id="set-desc" className="px-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="px-label" htmlFor="set-budget">COMPANY MONTHLY BUDGET (USD, 0 = NO CAP)</label>
        <input id="set-budget" className="px-input" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        <label className="row" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
          New hires (including ones agents hire) wait in the lobby for my signature
        </label>
        <button className="px-btn primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          🗂 File it
        </button>
      </div>
      <div className="px-card">
        <h4>OPENING HOURS</h4>
        <p>
          The office is <b>{paused ? "CLOSED" : "OPEN"}</b>. Closing pauses the whole company: agents stop picking up work until you reopen.
        </p>
        <button
          className={`px-btn ${paused ? "good" : "bad"}`}
          disabled={toggle.isPending}
          onClick={() => (paused || confirm("Close the office? All agents will stop picking up work.")) && toggle.mutate(undefined)}
        >
          {paused ? "🔓 Reopen the office" : "🔒 Close the office"}
        </button>
      </div>
      <WorkingHoursCard />
      <div className="row">
        <span className="muted">Members, invites and environments:</span>
        <ClassicLink path={`/${company.issuePrefix}/company/settings/members`}>Members ↗</ClassicLink>
        <ClassicLink path={`/${company.issuePrefix}/company/settings/environments`}>Environments ↗</ClassicLink>
      </div>
    </>
  );
}

// ── Org chart gallery ───────────────────────────────────────────────────
export function OrgPanel() {
  const { company, agents } = useOfficeData();
  const { data, isLoading } = useOrg(company.id);
  const staff = agents.filter((a) => a.status !== "terminated");
  const move = useAction(
    ({ agentId, reportsTo }: { agentId: string; reportsTo: string | null }) => api.updateAgent(agentId, { reportsTo }),
    "Org chart redrawn.",
    [keys.org(company.id), keys.agents(company.id)],
  );

  const descendants = (node: OrgNode): Set<string> => {
    const out = new Set<string>();
    const walk = (n: OrgNode) => n.reports.forEach((r) => (out.add(r.id), walk(r)));
    walk(node);
    return out;
  };

  const renderNode = (node: OrgNode, depth: number): React.ReactNode => {
    const agent = staff.find((a) => a.id === node.id);
    const blocked = descendants(node);
    return (
      <div key={node.id} style={{ marginLeft: depth ? 22 : 0, borderLeft: depth ? "3px solid var(--ink)" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div className="px-card" style={{ margin: "8px 3px" }}>
          <div className="row">
            <Avatar agent={agent} size={26} />
            <span style={{ flex: 1 }}>
              <b>{node.name}</b> <span className="muted">· {agent?.title ?? ROLE_LABEL[node.role]}</span>
            </span>
            <span className={`tag ${node.status}`}>{node.status.replace("_", " ")}</span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted" style={{ fontSize: 17 }}>reports to</span>
            <select
              className="px-select"
              style={{ width: "auto", margin: 0, padding: "2px 6px", fontSize: 17 }}
              aria-label={`${node.name} reports to`}
              value={agent?.reportsTo ?? ""}
              disabled={move.isPending}
              onChange={(e) => move.mutate({ agentId: node.id, reportsTo: e.target.value || null })}
            >
              <option value="">You (CEO)</option>
              {staff
                .filter((a) => a.id !== node.id && !blocked.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
          </div>
        </div>
        {node.reports.map((r) => renderNode(r, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <div className="px-card" style={{ textAlign: "center" }}>
        <Avatar size={30} />
        <div><b>YOU</b> · CEO / Board</div>
      </div>
      {isLoading && <div className="muted">Dusting off the frame…</div>}
      {data?.length === 0 && <div className="muted">Nobody to chart yet. Hire someone in HR.</div>}
      {data?.map((n) => renderNode(n, 1))}
    </>
  );
}

// ── Training library: skills ────────────────────────────────────────────
export function SkillsPanel() {
  const { company, agents } = useOfficeData();
  const [tab, setTab] = useState<"library" | "catalog" | "assign">("library");
  const skills = useCompanySkills(company.id);
  const catalog = useSkillCatalog();
  const installedKeys = useMemo(() => new Set((skills.data ?? []).map((s) => s.key)), [skills.data]);

  const install = useAction(
    (catalogSkillId: string) => api.installCatalogSkill(company.id, catalogSkillId),
    "New book on the shelf.",
    [keys.skills(company.id)],
  );

  return (
    <>
      <Tabs
        tabs={[
          ["library", `📚 Shelf (${skills.data?.length ?? 0})`],
          ["catalog", "🛒 Catalog"],
          ["assign", "🎓 Train staff"],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "library" &&
        (skills.data ?? []).map((s) => (
          <div key={s.id} className="px-card" style={{ margin: "8px 3px" }}>
            <h4>📕 {s.name}</h4>
            <div style={{ fontSize: 18 }}>{s.description ?? "No description."}</div>
            <div className="muted" style={{ fontSize: 15 }}>{s.key}</div>
          </div>
        ))}
      {tab === "catalog" &&
        (catalog.data ?? []).map((c) => {
          const have = installedKeys.has(c.key);
          return (
            <div key={c.id} className="px-card" style={{ margin: "8px 3px" }}>
              <div className="row">
                <h4 style={{ flex: 1, margin: 0 }}>{c.name}</h4>
                <span className="tag">{c.category}</span>
              </div>
              <div style={{ fontSize: 18, margin: "4px 0" }}>{c.description}</div>
              {c.recommendedForRoles.length > 0 && (
                <div className="muted" style={{ fontSize: 16 }}>Good for: {c.recommendedForRoles.join(", ")}</div>
              )}
              <button className={`px-btn small ${have ? "" : "primary"}`} disabled={have || install.isPending} onClick={() => install.mutate(c.id)}>
                {have ? "✔ On the shelf" : "+ Add to library"}
              </button>
            </div>
          );
        })}
      {tab === "assign" && <SkillAssign agents={agents.filter((a) => a.status !== "terminated")} />}
      <div style={{ marginTop: 8 }}>
        <ClassicLink path={`/${company.issuePrefix}/skills/studio`}>Write a new skill in Skill Studio ↗</ClassicLink>
      </div>
    </>
  );
}

function SkillAssign({ agents }: { agents: ReturnType<typeof useOfficeData>["agents"] }) {
  const { company } = useOfficeData();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const snapshot = useAgentSkills(agentId || null);
  const skills = useCompanySkills(company.id);
  const [draft, setDraft] = useState<string[] | null>(null);
  const desired = draft ?? snapshot.data?.desiredSkills ?? [];
  const allKeys = useMemo(() => {
    const keysSet = new Set([...(skills.data ?? []).map((s) => s.key), ...(snapshot.data?.desiredSkills ?? [])]);
    return [...keysSet].sort();
  }, [skills.data, snapshot.data]);
  const nameOf = (k: string) => skills.data?.find((s) => s.key === k)?.name ?? k.split("/").pop();

  const save = useAction(
    () => api.syncAgentSkills(agentId, desired),
    "Training complete.",
    [keys.agentSkills(agentId), keys.agents(company.id)],
  );

  return (
    <div className="px-card">
      <label className="px-label" htmlFor="train-who">WHO'S TRAINING?</label>
      <select
        id="train-who"
        className="px-select"
        value={agentId}
        onChange={(e) => {
          setAgentId(e.target.value);
          setDraft(null);
        }}
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      {snapshot.data && !snapshot.data.supported && <p className="muted">This employee's adapter doesn't support skills.</p>}
      {allKeys.map((k) => (
        <label key={k} className="row" style={{ margin: "4px 0" }}>
          <input
            type="checkbox"
            checked={desired.includes(k)}
            onChange={(e) => setDraft(e.target.checked ? [...desired, k] : desired.filter((x) => x !== k))}
          />
          {nameOf(k)}
        </label>
      ))}
      <button className="px-btn primary" disabled={!agentId || draft === null || save.isPending} onClick={() => save.mutate(undefined)}>
        🎓 Save training plan
      </button>
    </div>
  );
}

// ── Scheduling room: routines ───────────────────────────────────────────
const SCHEDULES: [string, string, string][] = [
  ["none", "No schedule (run by hand)", ""],
  ["hourly", "Every hour", "0 * * * *"],
  ["daily", "Every day at 9:00", "0 9 * * *"],
  ["weekdays", "Weekdays at 9:00", "0 9 * * 1-5"],
  ["weekly", "Mondays at 9:00", "0 9 * * 1"],
  ["custom", "Custom cron…", ""],
];

function describeCron(cron: string | null): string {
  if (!cron) return "manual";
  return SCHEDULES.find(([, , c]) => c === cron)?.[1] ?? `cron ${cron}`;
}

export function RoutinesPanel() {
  const { company, agents, agentById } = useOfficeData();
  const { data, isLoading } = useRoutines(company.id);
  const staff = agents.filter((a) => a.status !== "terminated" && a.status !== "pending_approval");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState(staff[0]?.id ?? "");
  const [schedule, setSchedule] = useState("daily");
  const [cron, setCron] = useState("0 9 * * *");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const create = useAction(
    async () => {
      const routine = await api.createRoutine(company.id, {
        title: title.trim(),
        description: desc.trim() || undefined,
        assigneeAgentId: assignee || null,
        status: "active",
      });
      const expr = schedule === "custom" ? cron.trim() : SCHEDULES.find(([id]) => id === schedule)?.[2];
      if (expr) await api.addScheduleTrigger(routine.id, expr, tz, describeCron(expr));
      setTitle("");
      setDesc("");
    },
    "Pinned to the calendar.",
    [keys.routines(company.id)],
  );
  const run = useAction((r: Routine) => api.runRoutine(r.id), (r) => `${r.title}: started now.`, [keys.routines(company.id), keys.issues(company.id)]);
  const toggle = useAction(
    (r: Routine) => api.updateRoutine(r.id, { status: r.status === "active" ? "paused" : "active" }),
    (r) => (r.status === "active" ? `${r.title} paused.` : `${r.title} back on.`),
    [keys.routines(company.id)],
  );

  return (
    <>
      <div className="px-card">
        <h4>NEW RECURRING CHORE</h4>
        <input className="px-input" aria-label="Routine title" placeholder="e.g. Morning triage of new bugs" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="px-textarea" aria-label="Instructions" placeholder="What should happen each time?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <label className="px-label" htmlFor="rt-who">WHO DOES IT</label>
        <select id="rt-who" className="px-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label className="px-label" htmlFor="rt-when">WHEN ({tz})</label>
        <select id="rt-when" className="px-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
          {SCHEDULES.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        {schedule === "custom" && (
          <input className="px-input" aria-label="Cron expression" placeholder="min hour day month weekday" value={cron} onChange={(e) => setCron(e.target.value)} />
        )}
        <button className="px-btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate(undefined)}>
          📅 Put it on the calendar
        </button>
      </div>

      {isLoading && <div className="muted">Flipping through the calendar…</div>}
      {data?.length === 0 && <div className="muted">The calendar is blank.</div>}
      {data?.map((r) => {
        const trig = r.triggers.find((t) => t.kind === "schedule");
        return (
          <div key={r.id} className="px-card" style={{ margin: "8px 3px", opacity: r.status === "active" ? 1 : 0.65 }}>
            <div className="row">
              <h4 style={{ flex: 1, margin: 0 }}>📅 {r.title}</h4>
              <span className={`tag ${r.status === "active" ? "running" : "paused"}`}>{r.status}</span>
            </div>
            <div style={{ fontSize: 18 }}>
              {describeCron(trig?.cronExpression ?? null)} · {agentById(r.assigneeAgentId)?.name ?? "unassigned"}
            </div>
            <div className="muted" style={{ fontSize: 16 }}>
              next: {when(trig?.nextRunAt)} · last: {when(r.lastTriggeredAt)}
            </div>
            <div className="row">
              <button className="px-btn small primary" disabled={run.isPending} onClick={() => run.mutate(r)}>▶ Run now</button>
              <button className="px-btn small" disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
                {r.status === "active" ? "⏸ Pause" : "▶ Resume"}
              </button>
              <ClassicLink path={`/${company.issuePrefix}/routines/${r.id}`}>Edit ↗</ClassicLink>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Workshop: projects & workspaces ─────────────────────────────────────
const PROJECT_STATUSES = ["backlog", "planned", "in_progress", "completed", "cancelled"];

export function ProjectsPanel() {
  const { company, agents, agentById } = useOfficeData();
  const { data, isLoading } = useProjects(company.id);
  const staff = agents.filter((a) => a.status !== "terminated");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [lead, setLead] = useState("");
  const [source, setSource] = useState<"none" | "local_path" | "git_repo">("local_path");
  const [location, setLocation] = useState("");

  const create = useAction(
    async () => {
      await api.createProject(company.id, {
        name: name.trim(),
        description: desc.trim() || undefined,
        leadAgentId: lead || null,
        status: "in_progress",
        ...(source !== "none" && location.trim()
          ? {
              workspace:
                source === "local_path"
                  ? { name: name.trim(), sourceType: "local_path" as const, cwd: location.trim(), isPrimary: true }
                  : { name: name.trim(), sourceType: "git_repo" as const, repoUrl: location.trim(), isPrimary: true },
            }
          : {}),
      });
      setName("");
      setDesc("");
      setLocation("");
    },
    "New crate on the workbench.",
    [keys.projects(company.id)],
  );
  const update = useAction(
    ({ id, body }: { id: string; body: Parameters<typeof api.updateProject>[1] }) => api.updateProject(id, body),
    "Project updated.",
    [keys.projects(company.id)],
  );

  return (
    <>
      <div className="px-card">
        <h4>NEW PROJECT</h4>
        <input className="px-input" aria-label="Project name" placeholder="e.g. Mobile app" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="px-textarea" aria-label="Project description" placeholder="What is it?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <label className="px-label" htmlFor="pj-lead">LEAD</label>
        <select id="pj-lead" className="px-select" value={lead} onChange={(e) => setLead(e.target.value)}>
          <option value="">No lead</option>
          {staff.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label className="px-label" htmlFor="pj-src">WHERE THE CODE LIVES</label>
        <select id="pj-src" className="px-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="local_path">A folder on this machine</option>
          <option value="git_repo">A git repository URL</option>
          <option value="none">Let Paperclip make a folder</option>
        </select>
        {source !== "none" && (
          <input
            className="px-input"
            aria-label="Folder or repository"
            placeholder={source === "local_path" ? "D:\\Work\\my-repo" : "https://github.com/org/repo.git"}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        )}
        <button className="px-btn primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate(undefined)}>
          🔨 Open the crate
        </button>
      </div>

      {isLoading && <div className="muted">Sorting the crates…</div>}
      {data
        ?.filter((p) => !p.archivedAt)
        .map((p) => {
          const where = p.codebase?.repoUrl ?? p.codebase?.localFolder ?? p.codebase?.effectiveLocalFolder;
          return (
            <div key={p.id} className="px-card" style={{ margin: "8px 3px" }}>
              <div className="row">
                <h4 style={{ flex: 1, margin: 0 }}>📦 {p.name}</h4>
                <span className="tag">{p.taskCount} tasks</span>
              </div>
              {p.description && <div style={{ fontSize: 18 }}>{p.description}</div>}
              {where && <div className="muted" style={{ fontSize: 15, wordBreak: "break-all" }}>📁 {where}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <select
                  className="px-select"
                  style={{ width: "auto", margin: 0, padding: "2px 6px", fontSize: 17 }}
                  aria-label={`${p.name} status`}
                  value={p.status}
                  onChange={(e) => update.mutate({ id: p.id, body: { status: e.target.value } })}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
                <select
                  className="px-select"
                  style={{ width: "auto", margin: 0, padding: "2px 6px", fontSize: 17 }}
                  aria-label={`${p.name} lead`}
                  value={p.leadAgentId ?? ""}
                  onChange={(e) => update.mutate({ id: p.id, body: { leadAgentId: e.target.value || null } })}
                >
                  <option value="">No lead</option>
                  {staff.map((a) => (
                    <option key={a.id} value={a.id}>👷 {agentById(a.id)?.name}</option>
                  ))}
                </select>
                <ClassicLink path={`/${company.issuePrefix}/projects/${p.id}/configuration`}>Workspace setup ↗</ClassicLink>
              </div>
            </div>
          );
        })}
    </>
  );
}

// ── Switchboard: tools & connections ────────────────────────────────────
export function ToolsPanel() {
  const { company } = useOfficeData();
  const [tab, setTab] = useState<"lines" | "gallery">("lines");
  const conns = useToolConnections(company.id);
  const gallery = useToolGallery(company.id);
  const [q, setQ] = useState("");
  const apps = (gallery.data ?? []).filter((a) => !q || `${a.name} ${a.description} ${a.categories.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Tabs tabs={[["lines", `☎ Lines (${conns.data?.length ?? 0})`], ["gallery", "🧩 App gallery"]]} value={tab} onChange={setTab} />
      {tab === "lines" && (
        <>
          {conns.data?.length === 0 && <div className="muted">No lines plugged in yet.</div>}
          {conns.data?.map((c) => {
            const ok = c.enabled && c.healthStatus === "ok";
            return (
              <div key={c.id} className="px-card" style={{ margin: "8px 3px" }}>
                <div className="row">
                  <span style={{ width: 12, height: 12, background: !c.enabled ? "#777" : ok ? "#4ae04a" : "#E24B4A", boxShadow: "0 0 0 2px var(--ink)" }} />
                  <h4 style={{ flex: 1, margin: 0 }}>{c.name}</h4>
                  <span className="tag">{c.connectionPurpose}</span>
                </div>
                <div className="muted" style={{ fontSize: 16 }}>
                  {c.transport} · {c.status}
                  {c.healthMessage ? ` · ${c.healthMessage}` : ""}
                </div>
                {c.lastError && <div style={{ color: "var(--bad)", fontSize: 16 }}>⚠ {c.lastError}</div>}
                {c.enabled && c.healthStatus === "error" && (
                  <ClassicLink path={`/${company.issuePrefix}/apps/${c.id}/permissions`}>🔌 Reconnect ↗</ClassicLink>
                )}
              </div>
            );
          })}
          <div className="row">
            <ClassicLink path={`/${company.issuePrefix}/apps/connections`}>Manage lines ↗</ClassicLink>
            <ClassicLink path={`/${company.issuePrefix}/apps/advanced`}>MCP servers ↗</ClassicLink>
          </div>
        </>
      )}
      {tab === "gallery" && (
        <>
          <input className="px-input" aria-label="Search apps" placeholder="search: github, slack, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="muted" style={{ fontSize: 17 }}>Plugging in a line needs a sign-in with that service, which happens on the classic screen.</p>
          {apps.map((a) => (
            <div key={a.slug} className="px-card" style={{ margin: "8px 3px" }}>
              <div className="row">
                <h4 style={{ flex: 1, margin: 0 }}>{a.featured ? "★ " : ""}{a.name}</h4>
                {a.categories.slice(0, 2).map((c) => (
                  <span key={c} className="tag">{c}</span>
                ))}
              </div>
              <div style={{ fontSize: 18, margin: "4px 0" }}>{a.description}</div>
              <ClassicLink path={`/${company.issuePrefix}/apps/connect/${a.slug}`}>Plug in ↗</ClassicLink>
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ── Vault: secrets ──────────────────────────────────────────────────────
export function VaultPanel() {
  const { company } = useOfficeData();
  const { data, isLoading } = useSecrets(company.id);
  const [name, setName] = useState("");
  const [keyName, setKeyName] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [rotating, setRotating] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");

  const create = useAction(
    async () => {
      await api.createSecret(company.id, { name: name.trim(), key: keyName.trim() || undefined, value, description: desc.trim() || undefined });
      setName("");
      setKeyName("");
      setValue("");
      setDesc("");
    },
    "Locked in the vault.",
    [keys.secrets(company.id)],
  );
  const rotate = useAction(
    async (id: string) => {
      await api.rotateSecret(id, newValue);
      setRotating(null);
      setNewValue("");
    },
    "Combination changed.",
    [keys.secrets(company.id)],
  );
  const remove = useAction((id: string) => api.deleteSecret(id), "Shredded.", [keys.secrets(company.id)]);

  return (
    <>
      <p className="muted">Values go in and never come back out. Agents get them injected at run time; nobody can read them here.</p>
      <div className="px-card">
        <h4>DEPOSIT A SECRET</h4>
        <input className="px-input" aria-label="Secret name" placeholder="Name, e.g. GitHub token" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="px-input" aria-label="Environment variable key" placeholder="Env key (optional), e.g. GITHUB_TOKEN" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        <input className="px-input" aria-label="Secret value" type="password" autoComplete="new-password" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <input className="px-input" aria-label="Description" placeholder="What is it for? (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button className="px-btn primary" disabled={!name.trim() || !value || create.isPending} onClick={() => create.mutate(undefined)}>
          🔐 Lock it away
        </button>
      </div>
      {isLoading && <div className="muted">Spinning the dial…</div>}
      {data?.length === 0 && <div className="muted">The vault is empty.</div>}
      {data?.map((s) => (
        <div key={s.id} className="px-card" style={{ margin: "8px 3px" }}>
          <div className="row">
            <h4 style={{ flex: 1, margin: 0 }}>🔑 {s.name}</h4>
            <span className="tag">v{s.latestVersion}</span>
          </div>
          <div className="muted" style={{ fontSize: 16 }}>
            {s.key} · {s.provider.replace(/_/g, " ")}
            {typeof s.referenceCount === "number" ? ` · used by ${s.referenceCount}` : ""} · rotated {when(s.lastRotatedAt)}
          </div>
          {s.description && <div style={{ fontSize: 17 }}>{s.description}</div>}
          {rotating === s.id ? (
            <div className="row">
              <input className="px-input" style={{ flex: 1, margin: 0 }} type="password" autoComplete="new-password" aria-label="New value" placeholder="New value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              <button className="px-btn small primary" disabled={!newValue || rotate.isPending} onClick={() => rotate.mutate(s.id)}>Save</button>
              <button className="px-btn small" onClick={() => setRotating(null)}>Cancel</button>
            </div>
          ) : (
            <div className="row">
              <button className="px-btn small" onClick={() => { setRotating(s.id); setNewValue(""); }}>🔄 Rotate</button>
              <button
                className="px-btn small bad"
                disabled={remove.isPending}
                onClick={() => confirm(`Shred "${s.name}"? Agents using it will lose access.`) && remove.mutate(s.id)}
              >
                🗑 Shred
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ── Generator room: adapters ────────────────────────────────────────────
export function AdaptersPanel() {
  const { company, agents } = useOfficeData();
  const { data, isLoading } = useAdapters();
  const [results, setResults] = useState<Record<string, Awaited<ReturnType<typeof api.testAdapter>>>>({});
  const { toast } = useOfficeData();
  const usage = (type: string) => agents.filter((a) => a.adapterType === type && a.status !== "terminated").length;

  const toggle = useAction(
    ({ type, disabled }: { type: string; disabled: boolean }) => api.setAdapterDisabled(type, disabled),
    ({ type, disabled }) => `${type} ${disabled ? "switched off" : "switched on"}.`,
    [keys.adapters],
  );
  const test = useMutation({
    mutationFn: (type: string) => api.testAdapter(company.id, type),
    onSuccess: (r, type) => setResults((s) => ({ ...s, [type]: r })),
    onError: (e: Error) => toast(e.message),
  });

  const sorted = [...(data ?? [])].sort((a, b) => usage(b.type) - usage(a.type) || a.type.localeCompare(b.type));

  return (
    <>
      <p className="muted">Each generator powers a kind of employee brain. Switch off the ones you don't use.</p>
      {isLoading && <div className="muted">Warming up…</div>}
      {sorted.map((a) => {
        const n = usage(a.type);
        const r = results[a.type];
        return (
          <div key={a.type} className="px-card" style={{ margin: "8px 3px", opacity: a.disabled ? 0.6 : 1 }}>
            <div className="row">
              <span style={{ width: 12, height: 12, background: a.disabled ? "#7a2a2a" : "#4ae04a", boxShadow: "0 0 0 2px var(--ink)" }} />
              <h4 style={{ flex: 1, margin: 0 }}>⚙ {a.label}</h4>
              <span className="tag">{a.source}</span>
            </div>
            <div className="muted" style={{ fontSize: 16 }}>
              {a.modelsCount} models · {n} employee(s)
              {a.capabilities.supportsSkills ? " · skills" : ""}
              {a.capabilities.supportsAcp ? " · ACP" : ""}
            </div>
            <div className="row">
              <button
                className={`px-btn small ${a.disabled ? "good" : ""}`}
                disabled={toggle.isPending}
                onClick={() =>
                  (a.disabled || n === 0 || confirm(`${n} employee(s) use ${a.type}. Switch it off anyway?`)) &&
                  toggle.mutate({ type: a.type, disabled: !a.disabled })
                }
              >
                {a.disabled ? "⏻ Switch on" : "⏻ Switch off"}
              </button>
              {!a.disabled && (
                <button className="px-btn small primary" disabled={test.isPending} onClick={() => test.mutate(a.type)}>
                  {test.isPending && test.variables === a.type ? "Testing…" : "🔌 Test"}
                </button>
              )}
            </div>
            {r && (
              <div style={{ background: "#0e1a12", color: "#7cf07c", padding: 8, marginTop: 8, fontSize: 17, boxShadow: "0 0 0 2px #000" }}>
                <div>RESULT: {r.status.toUpperCase()}</div>
                {r.checks.map((c) => (
                  <div key={c.code} style={{ color: c.level === "error" ? "#ff8a8a" : c.level === "warn" ? "#F5C542" : undefined }}>
                    {c.level === "error" ? "✖" : c.level === "warn" ? "!" : "✔"} {c.message}
                    {c.hint ? ` (${c.hint})` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
