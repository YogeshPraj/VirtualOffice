import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "../api/types";
import { useSecrets } from "../api/hooks";
import type { MachineState } from "../lib/machine";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

const HIDE_KEY = "pixel-office:move-in-hidden";
export const MOVE_IN_EVENT = "pixel-office:move-in";

export interface MoveInInput {
  setup: { level: "ok" | "warn" | "bad"; id: string }[] | null;
  repo: boolean | null;
  behind: number;
  missingSettings: string[];
  secrets: number | null;
  agents: Pick<Agent, "name" | "status">[];
}

export type StepId = "machine" | "repo" | "pull" | "settings" | "vault" | "team";
export interface Step {
  id: StepId;
  label: string;
  done: boolean;
  detail: string;
}

/** The steps for a new machine, each worked out from what the office can see. */
export function moveInSteps(i: MoveInInput): Step[] {
  const bad = i.setup?.filter((c) => c.level === "bad").length ?? 0;
  const people = i.agents.filter((a) => a.status !== "terminated");
  const broken = people.filter((a) => a.status === "error");
  return [
    {
      id: "machine",
      label: "Machine ready",
      done: i.setup !== null && bad === 0,
      detail: i.setup === null ? "Checking…" : bad ? `${bad} setup check${bad === 1 ? "" : "s"} failing: see Setup check below.` : "Tools, sign-ins and services are in place.",
    },
    {
      id: "repo",
      label: "Company repo",
      done: i.repo === true,
      detail: i.repo ? "Your private company repo is in company/." : "Clone your private company repo into company/ so backups and settings travel with you.",
    },
    {
      id: "pull",
      label: "Latest copy",
      done: i.repo === true && i.behind === 0,
      detail: !i.repo ? "Needs the company repo first." : i.behind ? `company/ is ${i.behind} commit${i.behind === 1 ? "" : "s"} behind the other machine.` : "company/ is up to date.",
    },
    {
      id: "settings",
      label: "Office settings",
      done: i.missingSettings.length === 0,
      detail: i.missingSettings.length ? `Backed up but not on this machine yet: ${i.missingSettings.map((n) => n.replace(".json", "")).join(", ")}.` : "Templates, due dates, views and pins are here.",
    },
    {
      id: "vault",
      label: "Vault secrets (if needed)",
      done: (i.secrets ?? 0) > 0,
      detail: i.secrets === null ? "Checking…" : i.secrets ? `${i.secrets} secret${i.secrets === 1 ? "" : "s"} in the vault.` : "Secrets never travel with the company: add the tokens your employees use (ADO, GitHub…).",
    },
    {
      id: "team",
      label: "Employees",
      done: people.length > 0 && broken.length === 0,
      detail: !people.length ? "Nobody works here yet: hire someone, or import your company." : broken.length ? `Needs a look: ${broken.map((a) => a.name).join(", ")}.` : `${people.length} employee${people.length === 1 ? "" : "s"} ready.`,
    },
  ];
}

const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

/** A guided list for a new machine (or after a move): what's left before the office runs as before. */
export function MoveInCard() {
  const { company, agents, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(readHidden);
  const setup = useQuery({ queryKey: ["setup-check"], queryFn: async () => (await (await fetch("/office-admin/setup-check")).json()) as { checks: MoveInInput["setup"] }, staleTime: 60_000 });
  const backup = useQuery({ queryKey: ["backup-status"], queryFn: async () => (await (await fetch("/office-admin/backup")).json()) as { repo: boolean; settings?: { missingHere: string[] } } });
  const machine = useQuery({ queryKey: ["machine"], queryFn: async () => (await (await fetch("/office-admin/machine")).json()) as MachineState });
  const secrets = useSecrets(company.id);
  const restore = useMutation({
    mutationFn: async () => (await (await fetch("/office-admin/backup/restore-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()) as { restored: string[] },
    onSuccess: (r) => {
      toast(r.restored.length ? `Restored ${r.restored.map((n) => n.replace(".json", "")).join(", ")}.` : "Nothing to restore.");
      qc.invalidateQueries({ queryKey: ["backup-status"] });
      qc.invalidateQueries({ queryKey: ["office-settings"] });
    },
  });
  const pull = useMutation({
    mutationFn: async () => (await (await fetch("/office-admin/machine/pull", { method: "POST" })).json()) as { detail: string; state: MachineState },
    onSuccess: (r) => {
      toast(r.detail);
      qc.setQueryData(["machine"], r.state);
      qc.invalidateQueries({ queryKey: ["backup-status"] });
    },
  });

  useEffect(() => {
    const show = () => {
      setHidden(false);
      try {
        localStorage.removeItem(HIDE_KEY);
      } catch {
        /* fine */
      }
    };
    window.addEventListener(MOVE_IN_EVENT, show);
    return () => window.removeEventListener(MOVE_IN_EVENT, show);
  }, []);

  const steps = moveInSteps({
    setup: setup.data?.checks ?? null,
    repo: backup.data ? backup.data.repo : null,
    behind: machine.data?.behind ?? 0,
    missingSettings: backup.data?.settings?.missingHere ?? [],
    secrets: secrets.data ? secrets.data.length : null,
    agents,
  });
  const left = steps.filter((s) => !s.done).length;
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* shows again next time */
    }
  };
  const action = (s: Step) => {
    if (s.done) return null;
    const btn = (label: string, run: () => void, busy = false) => (
      <button className="px-btn small" disabled={busy} onClick={run}>
        {label}
      </button>
    );
    if (s.id === "machine") return btn("Show me", () => document.getElementById("setup-check")?.scrollIntoView({ behavior: "smooth" }));
    if (s.id === "pull" && machine.data?.repo && !machine.data.ahead) return btn(pull.isPending ? "Pulling…" : "⬇ Pull", () => pull.mutate(), pull.isPending);
    if (s.id === "settings") return btn(restore.isPending ? "Restoring…" : "Restore", () => restore.mutate(), restore.isPending);
    if (s.id === "vault") return btn("Open the vault", () => (goFloor("basement"), open({ kind: "room", room: "vault" })));
    if (s.id === "team") return btn("Open HR", () => open({ kind: "room", room: "hr" }));
    return null;
  };
  return (
    <div className="px-card move-in" aria-label="Move-in checklist" style={left ? { borderLeft: "8px solid var(--accent)" } : undefined}>
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🚚 MOVE-IN CHECKLIST</h4>
        <button className="px-btn small" onClick={hide}>{left ? "Hide" : "Done, hide it"}</button>
      </div>
      <div className="muted" style={{ fontSize: 15 }}>
        {left ? `${steps.length - left} of ${steps.length} done. What's left before the office runs here as it did on the other machine:` : "All moved in. 🎉"}
      </div>
      {steps.map((s) => (
        <div key={s.id} className="status-row">
          <span>{s.done ? "✅" : "⬜"}</span>
          <span style={{ flex: 1, fontSize: 16 }}>
            <b>{s.label}</b>: {s.detail}
          </span>
          {action(s)}
        </div>
      ))}
    </div>
  );
}
