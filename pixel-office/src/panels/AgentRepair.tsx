import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Agent } from "../api/types";
import { keys, useAdapters } from "../api/hooks";
import { providerLabel, isProvider, buildSwitchConfig } from "../api/providers";
import { useOfficeData } from "../state/officeData";

/** Plain-language next step for errors we recognise; `provider` is the employee's brain provider. */
export function errorHint(reason: string | null | undefined, provider = "their AI provider"): string | null {
  if (!reason) return null;
  if (/blocked by unresolved blockers/i.test(reason)) {
    return "Harmless: Paperclip woke them on a task that is still waiting for other tasks, so the run didn't start. Nothing was lost. Click \"Fixed it\" to clear the flag.";
  }
  if (/quota|rate limit|usage limit|credits?/i.test(reason)) return `${provider} hit its usage limit. They'll retry when it resets, or pick a smaller brain.`;
  if (/not logged in|not signed in|authenticat|login|unauthori[sz]ed/i.test(reason)) return `${provider} isn't signed in on this PC. See the checks below for the exact step.`;
  if (/ENOENT|not found|is not recognized/i.test(reason)) return "A program they need isn't installed. See the checks below, or test it in B1 → Generator room.";
  return null;
}

/** Repair kit for an employee in trouble: read the error, swap the brain, clear and retry. */
export function AgentRepair({ agent }: { agent: Agent }) {
  const { company, agents, toast } = useOfficeData();
  const qc = useQueryClient();
  const adapters = useAdapters();
  const providerName = (() => {
    const info = adapters.data?.find((a) => a.type === agent.adapterType);
    return info ? providerLabel(info) : agent.adapterType;
  })();
  const models = useQuery({
    queryKey: ["models", company.id, agent.adapterType],
    queryFn: () => api.models(company.id, agent.adapterType),
  });
  // The adapter itself explains what's wrong and how to fix it, whichever provider it is.
  const diagnosis = useQuery({
    queryKey: ["diagnose", company.id, agent.adapterType],
    queryFn: () => api.testAdapter(company.id, agent.adapterType),
    enabled: agent.status === "error",
    staleTime: 30_000,
    retry: false,
  });
  const problems = diagnosis.data?.checks.filter((c) => c.level === "error" || c.level === "warn") ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.agents(company.id) });
    qc.invalidateQueries({ queryKey: keys.attention(company.id) });
  };
  const clear = useMutation({
    mutationFn: () => api.clearAgentError(agent.id),
    onSuccess: () => {
      toast(`${agent.name} is back at the desk.`);
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });
  const swap = useMutation({
    mutationFn: (model: string) => api.setAgentModel(agent.id, model),
    onSuccess: (_d, model) => {
      toast(`${agent.name} now thinks with ${model || "the default brain"}.`);
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });
  const providers = (adapters.data ?? []).filter(isProvider);
  const switchProvider = useMutation({
    mutationFn: async (type: string) => {
      const schema = await api.adapterSchema(type);
      const { adapterConfig, runtimeConfig } = buildSwitchConfig(agent, type, agents, schema.fields);
      return api.switchAgentProvider(agent.id, type, adapterConfig, runtimeConfig);
    },
    onSuccess: (_d, type) => {
      const info = providers.find((p) => p.type === type);
      toast(`${agent.name} now runs on ${info ? providerLabel(info) : type}.`);
      qc.invalidateQueries({ queryKey: ["models", company.id] });
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });
  const current = typeof agent.adapterConfig.model === "string" ? agent.adapterConfig.model : "";
  const hint = errorHint(agent.errorReason, providerName);

  return (
    <div className="px-card" style={{ borderLeft: agent.status === "error" ? "8px solid var(--bad)" : undefined }}>
      <h4>{agent.status === "error" ? "🔧 REPAIR KIT" : "🧠 BRAIN"}</h4>
      {agent.status === "error" && (
        <>
          <div style={{ background: "#2a1010", color: "#ffb0b0", padding: 8, fontSize: 17, whiteSpace: "pre-wrap", boxShadow: "0 0 0 2px #000" }}>
            {agent.errorReason ?? "Unknown error."}
          </div>
          {hint && <p style={{ margin: "8px 0" }}>💡 {hint}</p>}
          {problems.map((c) => (
            <p key={c.code} style={{ margin: "8px 0" }}>
              🩺 {c.message}
              {c.hint ? ` — ${c.hint}` : ""}
            </p>
          ))}
        </>
      )}
      <label className="px-label" htmlFor={`provider-${agent.id}`}>PROVIDER</label>
      <select
        id={`provider-${agent.id}`}
        className="px-select"
        value={agent.adapterType}
        disabled={switchProvider.isPending}
        onChange={(e) => {
          const next = providers.find((p) => p.type === e.target.value);
          if (next && confirm(`Move ${agent.name} to ${providerLabel(next)}? Their current conversation won't carry over.`)) {
            switchProvider.mutate(next.type);
          }
        }}
      >
        {providers.map((p) => (
          <option key={p.type} value={p.type}>{providerLabel(p)}</option>
        ))}
        {!providers.some((p) => p.type === agent.adapterType) && <option value={agent.adapterType}>{providerName}</option>}
      </select>
      <label className="px-label" htmlFor={`brain-${agent.id}`}>MODEL</label>
      <select
        id={`brain-${agent.id}`}
        className="px-select"
        value={current}
        disabled={swap.isPending}
        onChange={(e) => swap.mutate(e.target.value)}
      >
        <option value="">Paperclip default</option>
        {models.data?.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
        {current && !models.data?.some((m) => m.id === current) && <option value={current}>{current}</option>}
      </select>
      {agent.status === "error" && (
        <button className="px-btn good" disabled={clear.isPending} onClick={() => clear.mutate()}>
          {clear.isPending ? "…" : "✔ Fixed it, back to work"}
        </button>
      )}
    </div>
  );
}
