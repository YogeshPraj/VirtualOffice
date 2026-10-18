import { useCallback, useEffect, useRef } from "react";
import { useOfficeData } from "../state/officeData";
import type { Agent, Company } from "../api/types";
import { useOffice } from "../state/officeStore";
import { notifyCeo } from "./useNotifications";

const KEY = "pixel-office:budget-alerts";
export const THRESHOLDS = [0.8, 1] as const;

/** Thresholds a spender has crossed: 0.8 and/or 1. A zero budget means "no cap". */
export function crossed(spentCents: number, budgetCents: number): number[] {
  if (!budgetCents || budgetCents <= 0) return [];
  return THRESHOLDS.filter((t) => spentCents >= budgetCents * t);
}

const month = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

function load(): Record<string, true> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, true>;
    // Keep only this month's records.
    return Object.fromEntries(Object.entries(raw).filter(([k]) => k.endsWith(`@${month()}`)));
  } catch {
    return {};
  }
}

/** Alert once per threshold per month when an employee (or the company) nears or hits its budget. */
export function useBudgetAlerts(company: Company, agents: Agent[], toast: (m: string) => void) {
  const open = useOffice((s) => s.open);
  useEffect(() => {
    const seen = load();
    const fresh: { key: string; text: string; agentId?: string }[] = [];
    const check = (id: string, label: string, spent: number, budget: number, agentId?: string) => {
      for (const t of crossed(spent, budget)) {
        const key = `${id}:${t}@${month()}`;
        if (seen[key]) continue;
        seen[key] = true;
        fresh.push({
          key,
          agentId,
          text: t >= 1 ? `${label} reached the monthly budget ($${(budget / 100).toFixed(2)}).` : `${label} has used ${Math.round((spent / budget) * 100)}% of the monthly budget.`,
        });
      }
    };
    check(`company:${company.id}`, company.name, company.spentMonthlyCents ?? 0, company.budgetMonthlyCents ?? 0);
    for (const a of agents) if (a.status !== "terminated") check(`agent:${a.id}`, a.name, a.spentMonthlyCents, a.budgetMonthlyCents, a.id);
    if (!fresh.length) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(seen));
    } catch {
      /* not kept: may alert again after a reload */
    }
    for (const f of fresh.slice(0, 3)) {
      notifyCeo("🪙 Budget", f.text, () => open(f.agentId ? { kind: "agent", agentId: f.agentId } : { kind: "room", room: "finance" }), f.key);
    }
    toast(fresh.map((f) => f.text).join(" "));
  }, [company, agents, open, toast]);
}

/** Mounted inside the office so it can use the office's toast. */
export function BudgetAlerts() {
  const { company, agents, toast } = useOfficeData();
  const ref = useRef(toast);
  ref.current = toast;
  const say = useCallback((m: string) => ref.current(m), []);
  useBudgetAlerts(company, agents, say);
  return null;
}
