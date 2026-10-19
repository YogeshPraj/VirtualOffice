import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../api/hooks";
import type { Agent } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { Handover } from "./Handover";

interface Leave {
  until: string;
  reason: string | null;
  since: string;
}
const KEY = ["leave"] as const;

export const useLeave = () => useQuery({ queryKey: KEY, queryFn: async () => (await (await fetch("/office-admin/leave")).json()) as Record<string, Leave>, staleTime: 60_000 });

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Send an employee on leave until a date, or bring them back early. */
export function TimeOff({ agent }: { agent: Agent }) {
  const { company, issues, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data: leave } = useLeave();
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const mine = issues.filter((i) => i.assigneeAgentId === agent.id && !["done", "cancelled", "backlog"].includes(i.status));
  const current = leave?.[agent.id];

  const change = useMutation({
    mutationFn: async (body: { until: string; reason: string } | null) => {
      const r = await fetch(`/office-admin/leave/${agent.id}`, body ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d as Record<string, Leave>;
    },
    onSuccess: (d, body) => {
      qc.setQueryData(KEY, d);
      qc.invalidateQueries({ queryKey: keys.agents(company.id) });
      toast(body ? `${agent.name} is on leave until ${day(body.until)}. They'll be back by themselves.` : `${agent.name} is back at their desk.`);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (agent.status === "terminated") return null;
  if (current) {
    return (
      <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }} aria-label="Time off">
        <h4>🏖 ON LEAVE</h4>
        <div style={{ fontSize: 17 }}>
          Back on <b>{day(current.until)}</b>
          {current.reason ? ` · ${current.reason}` : ""}. No new shifts until then; the office brings them back that morning.
        </div>
        {mine.length > 0 && (
          <div style={{ fontSize: 16, marginTop: 4 }}>
            ⚠ Still assigned {mine.length} open task{mine.length === 1 ? "" : "s"}; reassign anything that can't wait:
            {mine.map((i) => (
              <div key={i.id}>
                <button className="link-btn" onClick={() => open({ kind: "issue", issueId: i.id })}>
                  {i.identifier} {i.title}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <Handover agent={agent} />
          <button className="px-btn small" disabled={change.isPending} onClick={() => change.mutate(null)}>
            Bring them back now
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="px-card" aria-label="Time off">
      <h4>🏖 TIME OFF</h4>
      <div className="row">
        <label className="px-label" htmlFor={`leave-${agent.id}`} style={{ margin: 0 }}>BACK ON</label>
        <input id={`leave-${agent.id}`} type="date" className="px-input" style={{ width: 170, margin: 0 }} min={tomorrow()} value={until} onChange={(e) => setUntil(e.target.value)} />
        <input className="px-input" style={{ flex: 1, margin: 0 }} aria-label="Reason (optional)" placeholder="Reason (optional), e.g. saving budget" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button
        className="px-btn small"
        disabled={!until || change.isPending}
        onClick={() =>
          confirm(
            `Send ${agent.name} on leave until ${day(until)}?${agent.status === "running" ? " Their current shift will be stopped." : ""}${mine.length ? ` They still have ${mine.length} open task(s).` : ""}`,
          ) && change.mutate({ until, reason })
        }
      >
        🏖 Send on leave
      </button>
    </div>
  );
}
