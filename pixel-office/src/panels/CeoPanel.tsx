import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AttentionItem } from "../api/types";
import { useInteractions } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { ClassicLink } from "../ui/Window";
import { Avatar } from "../ui/Avatar";
import { InteractionDialog } from "./InteractionDialog";
import { AgentRepair } from "./AgentRepair";
import { RecoveryCard, StaleBlockerCard } from "./RecoveryCards";
import { logDecision } from "../api/brain";

const SEVERITY_COLOR: Record<string, string> = { critical: "#E24B4A", high: "#D85A30", medium: "#F5C542", low: "#9BE59B" };

/** Your office: everything that needs a human, as visitors queued at your door. */
export function CeoPanel() {
  const { attention } = useOfficeData();
  if (attention.length === 0) {
    return (
      <div className="px-card">
        <h4>ALL QUIET</h4>
        Nobody is waiting on you. The phone is silent. Enjoy the coffee.
      </div>
    );
  }
  return (
    <>
      <p className="muted">{attention.length} visitor(s) waiting at your door.</p>
      {attention.map((item) => (
        <AttentionCard key={`${item.sourceKind}:${item.subject.id}`} item={item} />
      ))}
    </>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const { agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const errored = item.sourceKind === "agent_error_alert" ? agentById(item.subject.id) : undefined;
  const by = errored ?? agentById(item.subject.metadata?.createdByAgentId as string | undefined);
  const issueId = (item.subject.metadata?.issueId as string | undefined) ?? item.relatedIssue?.id ?? null;

  return (
    <div className="px-card" style={{ borderLeft: `8px solid ${SEVERITY_COLOR[item.severity] ?? "#ccc"}` }}>
      <div className="row">
        {by && <Avatar agent={by} size={24} />}
        <h4 style={{ margin: 0 }}>{item.subject.title}</h4>
      </div>
      <div style={{ margin: "6px 0" }}>{item.whyNow}</div>
      {item.subject.kind === "interaction" && issueId && <InteractionBody issueId={issueId} interactionId={item.subject.id} />}
      {item.sourceKind === "approval" && <ApprovalActions approvalId={item.subject.id} />}
      {errored && <AgentRepair agent={errored} />}
      {item.sourceKind === "blocker_attention" && <StaleBlockerCard item={item} />}
      {item.sourceKind === "recovery_action" && <RecoveryCard item={item} />}
      <div className="row">
        {issueId && (
          <button className="px-btn small" onClick={() => open({ kind: "issue", issueId })}>
            Open task {item.subject.identifier ?? ""}
          </button>
        )}
        <ClassicLink path={item.subject.href}>Classic view ↗</ClassicLink>
      </div>
    </div>
  );
}

function InteractionBody({ issueId, interactionId }: { issueId: string; interactionId: string }) {
  const { data } = useInteractions(issueId);
  const interaction = data?.find((i) => i.id === interactionId && i.status === "pending");
  if (!interaction) return null;
  return <InteractionDialog interaction={interaction} />;
}

function ApprovalActions({ approvalId }: { approvalId: string }) {
  const { toast, company } = useOfficeData();
  const qc = useQueryClient();
  const { data: approval } = useQuery({ queryKey: ["approval", approvalId], queryFn: () => api.approval(approvalId) });
  const act = useMutation({
    mutationFn: (verb: "approve" | "reject") => (verb === "approve" ? api.approve(approvalId) : api.reject(approvalId)),
    onSuccess: (_d, verb) => {
      const what = `${approval?.type.replace(/_/g, " ") ?? "request"}${typeof approval?.payload?.name === "string" ? ` for ${approval.payload.name}` : ""}`;
      logDecision(`CEO ${verb === "approve" ? "approved" : "rejected"} the ${what}.`, company.name, "CEO office, approvals");
      toast(verb === "approve" ? "Signed. Welcome aboard!" : "Rejected.");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast(e.message),
  });
  return (
    <div>
      {approval && (
        <div className="muted" style={{ marginBottom: 6 }}>
          {approval.type.replace(/_/g, " ")}
          {typeof approval.payload?.name === "string" ? ` · ${approval.payload.name}` : ""}
        </div>
      )}
      <div className="row">
        <button className="px-btn good small" disabled={act.isPending} onClick={() => act.mutate("approve")}>
          ✔ Sign / Approve
        </button>
        <button className="px-btn bad small" disabled={act.isPending} onClick={() => act.mutate("reject")}>
          ✖ Reject
        </button>
      </div>
    </div>
  );
}
