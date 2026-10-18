import { createContext, useContext, useState, type ReactNode } from "react";
import type { Agent, AttentionItem, Company, Issue } from "../api/types";

export interface OfficeData {
  company: Company;
  agents: Agent[];
  issues: Issue[];
  attention: AttentionItem[];
  agentById: (id: string | null | undefined) => Agent | undefined;
  toast: (msg: string) => void;
}

const Ctx = createContext<OfficeData | null>(null);

export function OfficeDataProvider({ value, children }: { value: Omit<OfficeData, "agentById" | "toast">; children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const data: OfficeData = {
    ...value,
    agentById: (id) => (id ? value.agents.find((a) => a.id === id) : undefined),
    toast: (m) => {
      setMsg(m);
      setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3500);
    },
  };
  return (
    <Ctx.Provider value={data}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}

export function useOfficeData(): OfficeData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOfficeData outside provider");
  return v;
}
