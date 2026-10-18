import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { buildHireConfig, dominantProvider, isProvider, providerLabel } from "../api/providers";
import { useAdapters } from "../api/hooks";
import { AGENT_ROLES, type Agent, type AgentRole } from "../api/types";
import { keys } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { ProviderTag } from "../ui/ProviderTag";
import { appearanceFor } from "../pixel/sprite";

const ROLE_LABEL: Record<AgentRole, string> = {
  ceo: "CEO",
  cto: "CTO / Architect",
  cmo: "CMO / Marketing",
  cfo: "CFO / Finance",
  security: "Security",
  engineer: "Software Engineer",
  designer: "Designer",
  pm: "Product Manager",
  qa: "QA Engineer",
  devops: "DevOps",
  researcher: "Researcher",
  general: "Generalist",
};

/** Sensible starter job descriptions so a hire is useful on day one. */
const ROLE_SKILLS: Partial<Record<AgentRole, string>> = {
  pm: "Turns goals into specs and well-scoped tasks, assigns them to the right teammate, tracks progress and unblocks people. Escalates decisions to the CEO.",
  engineer: "Implements features and fixes in the codebase with tests. Opens small, reviewable changes and explains trade-offs.",
  qa: "Reviews changes, writes and runs tests, reproduces bugs with clear steps, and blocks anything that isn't ready.",
  designer: "Designs UX flows and UI, writes design specs with layout, states and copy, and reviews implementation for fidelity.",
  devops: "Owns CI/CD, environments and deployments. Keeps builds green and asks for approval before anything risky.",
  researcher: "Investigates questions, compares options and writes concise findings with sources.",
  cto: "Owns architecture and technical direction, reviews designs, and breaks big work into a plan for the team.",
};

export function HrPanel() {
  const { company, agents, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const staff = agents.filter((a) => a.status !== "terminated");

  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("engineer");
  const [title, setTitle] = useState("");
  const [skills, setSkills] = useState(ROLE_SKILLS.engineer ?? "");
  const [providerChoice, setProviderChoice] = useState("");
  const [model, setModel] = useState("");
  const [reportsTo, setReportsTo] = useState<string>(staff[0]?.id ?? "");
  const [budget, setBudget] = useState("20");
  const [autoWake, setAutoWake] = useState(false);

  const adapters = useAdapters();
  const providers = useMemo(() => (adapters.data ?? []).filter(isProvider), [adapters.data]);
  const provider = providerChoice || dominantProvider(providers, agents);
  const providerInfo = providers.find((p) => p.type === provider);

  const models = useQuery({
    queryKey: ["models", company.id, provider],
    queryFn: () => api.models(company.id, provider),
    enabled: !!provider,
  });
  const schema = useQuery({
    queryKey: ["adapter-schema", provider],
    queryFn: () => api.adapterSchema(provider),
    enabled: !!provider,
  });

  const hire = useMutation({
    mutationFn: () => {
      const { adapterConfig, aiConnection } = buildHireConfig(provider, agents, schema.data?.fields, model);
      return api.hire(company.id, {
        name: name.trim(),
        role,
        title: title.trim() || ROLE_LABEL[role],
        capabilities: skills.trim() || undefined,
        reportsTo: reportsTo || null,
        adapterType: provider,
        adapterConfig,
        runtimeConfig: {
          heartbeat: {
            enabled: autoWake,
            intervalSec: 300,
            cooldownSec: 10,
            wakeOnDemand: true,
            maxConcurrentRuns: 1,
            skipTimerWhenNoActionableWork: true,
          },
          ...(aiConnection ? { aiConnection } : {}),
        },
        budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)),
      });
    },
    onSuccess: ({ agent, approval }) => {
      toast(approval ? `${agent.name} is waiting in the lobby for your signature.` : `${agent.name} joined! Desk assigned.`);
      setName("");
      setTitle("");
      qc.invalidateQueries({ queryKey: keys.agents(company.id) });
      qc.invalidateQueries({ queryKey: keys.attention(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  const previewId = `preview:${name}:${role}`;

  return (
    <>
      <div className="px-card">
        <h4>JOB POSTING</h4>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: "none", textAlign: "center", width: 64 }}>
            <Avatar appearance={appearanceFor(previewId, role)} size={48} />
            <div className="muted" style={{ fontSize: 16 }}>candidate</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="px-label" htmlFor="hire-name">NAME</label>
            <input id="hire-name" className="px-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada" />
            <label className="px-label" htmlFor="hire-role">ROLE</label>
            <select
              id="hire-role"
              className="px-select"
              value={role}
              onChange={(e) => {
                const r = e.target.value as AgentRole;
                setRole(r);
                setSkills(ROLE_SKILLS[r] ?? "");
              }}
            >
              {AGENT_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="px-label" htmlFor="hire-title">TITLE</label>
        <input id="hire-title" className="px-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ROLE_LABEL[role]} />
        <label className="px-label" htmlFor="hire-skills">SKILLS & TECH STACK</label>
        <textarea id="hire-skills" className="px-textarea" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="What they're great at, languages, frameworks, tools…" />
        <label className="px-label" htmlFor="hire-provider">BRAIN PROVIDER</label>
        <select
          id="hire-provider"
          className="px-select"
          value={provider}
          onChange={(e) => {
            setProviderChoice(e.target.value);
            setModel("");
          }}
        >
          {providers.map((p) => (
            <option key={p.type} value={p.type}>{providerLabel(p)}</option>
          ))}
        </select>
        <label className="px-label" htmlFor="hire-model">BRAIN ({(providerInfo ? providerLabel(providerInfo) : "MODEL").toUpperCase()} MODEL)</label>
        <select id="hire-model" className="px-select" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">Paperclip default</option>
          {models.data?.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <label className="px-label" htmlFor="hire-boss">REPORTS TO</label>
        <select id="hire-boss" className="px-select" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
          <option value="">You (the CEO)</option>
          {staff.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {a.title ?? ROLE_LABEL[a.role]}</option>
          ))}
        </select>
        <label className="px-label" htmlFor="hire-budget">MONTHLY BUDGET (USD, 0 = UNLIMITED)</label>
        <input id="hire-budget" className="px-input" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        <label className="row" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={autoWake} onChange={(e) => setAutoWake(e.target.checked)} />
          Clock in every 5 min on their own (otherwise they wake when assigned work)
        </label>
        <button className="px-btn primary" disabled={!name.trim() || !provider || hire.isPending} onClick={() => hire.mutate()}>
          {hire.isPending ? "Signing…" : "✍ Sign contract"}
        </button>
      </div>

      <div className="px-card">
        <h4>STAFF ({staff.length})</h4>
        {staff.length === 0 && <div className="muted">No one yet. Your first hire gets the best desk.</div>}
        {staff.map((a) => (
          <StaffRow key={a.id} agent={a} onOpen={() => open({ kind: "agent", agentId: a.id })} />
        ))}
      </div>
    </>
  );
}

function StaffRow({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  return (
    <button className="rpg-option" style={{ color: "var(--ink)", display: "flex", gap: 10, alignItems: "center" }} onClick={onOpen}>
      <Avatar agent={agent} size={22} />
      <span style={{ flex: 1 }}>
        {agent.name} <span className="muted">· {agent.title ?? ROLE_LABEL[agent.role]}</span>
      </span>
      <ProviderTag adapterType={agent.adapterType} />
      <span className={`tag ${agent.status}`}>{agent.status.replace("_", " ")}</span>
    </button>
  );
}

export { ROLE_LABEL };
