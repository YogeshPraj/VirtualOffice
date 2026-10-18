import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Avatar } from "../ui/Avatar";
import { ClassicLink } from "../ui/Window";
import { ROLE_LABEL } from "./HrPanel";
import { AgentRepair } from "./AgentRepair";
import { OverShoulder } from "./OverShoulder";
import { ProviderTag } from "../ui/ProviderTag";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function AgentPanel({ agentId }: { agentId: string }) {
  const { company, issues, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const agent = agentById(agentId);

  const act = useMutation({
    mutationFn: (verb: "wake" | "pause" | "resume" | "fire") => {
      if (verb === "wake") return api.wakeAgent(agentId);
      if (verb === "pause") return api.pauseAgent(agentId);
      if (verb === "resume") return api.resumeAgent(agentId);
      return api.terminateAgent(agentId);
    },
    onSuccess: (_d, verb) => {
      toast({ wake: "Tapped them on the shoulder.", pause: "Sent home for now.", resume: "Back at the desk.", fire: "Cleared their desk." }[verb]);
      qc.invalidateQueries({ queryKey: keys.agents(company.id) });
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!agent) return <div className="muted">They seem to have left the building.</div>;
  const mine = issues.filter((i) => i.assigneeAgentId === agent.id && i.status !== "done" && i.status !== "cancelled");
  const boss = agentById(agent.reportsTo);
  const budgetPct = agent.budgetMonthlyCents > 0 ? Math.min(100, (agent.spentMonthlyCents / agent.budgetMonthlyCents) * 100) : 0;

  return (
    <>
      <div className="px-card">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Avatar agent={agent} size={64} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: 12 }}>{agent.name}</h4>
            <div>{agent.title ?? ROLE_LABEL[agent.role]}</div>
            <div className="muted">Reports to {boss?.name ?? "you"}</div>
            <div style={{ marginTop: 6 }}>
              <span className={`tag ${agent.status}`}>{agent.status.replace("_", " ")}</span>{" "}
              <ProviderTag adapterType={agent.adapterType} />{" "}
              {typeof agent.adapterConfig.model === "string" && <span className="tag">{agent.adapterConfig.model}</span>}
            </div>
          </div>
        </div>
        {agent.pauseReason && <p className="muted">Paused: {agent.pauseReason}</p>}
        {agent.capabilities && <p style={{ fontSize: 18 }}>{agent.capabilities}</p>}
        <div className="muted">
          Last clocked in: {agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString() : "never"}
        </div>
      </div>

      <AgentRepair agent={agent} />
      <OverShoulder agent={agent} />

      <div className="px-card">
        <h4>PAYCHECK</h4>
        {money(agent.spentMonthlyCents)} spent this month
        {agent.budgetMonthlyCents > 0 ? ` of ${money(agent.budgetMonthlyCents)}` : " · no cap"}
        {agent.budgetMonthlyCents > 0 && (
          <div className="meter">
            <div style={{ width: `${budgetPct}%`, background: budgetPct > 85 ? "var(--bad)" : undefined }} />
          </div>
        )}
      </div>

      <div className="px-card">
        <h4>ON THEIR DESK ({mine.length})</h4>
        {mine.length === 0 && <div className="muted">Nothing assigned. Pin a sticky note in the meeting room.</div>}
        {mine.map((i) => (
          <button key={i.id} className="rpg-option" style={{ color: "var(--ink)" }} onClick={() => open({ kind: "issue", issueId: i.id })}>
            {i.identifier} · {i.title} <small style={{ color: "var(--muted)" }}>{i.status.replace("_", " ")}</small>
          </button>
        ))}
      </div>

      <div className="row">
        <button className="px-btn primary small" disabled={act.isPending} onClick={() => act.mutate("wake")}>
          👋 Wake up
        </button>
        {agent.status === "paused" ? (
          <button className="px-btn good small" disabled={act.isPending} onClick={() => act.mutate("resume")}>
            ▶ Resume
          </button>
        ) : (
          <button className="px-btn small" disabled={act.isPending} onClick={() => act.mutate("pause")}>
            ⏸ Pause
          </button>
        )}
        <button
          className="px-btn bad small"
          disabled={act.isPending}
          onClick={() => {
            if (confirm(`Let ${agent.name} go? This terminates the agent.`)) act.mutate("fire");
          }}
        >
          Let go
        </button>
        <ClassicLink path={`/${company.issuePrefix}/agents/${(agent as { urlKey?: string }).urlKey ?? agent.id}`}>Full config ↗</ClassicLink>
      </div>
    </>
  );
}
