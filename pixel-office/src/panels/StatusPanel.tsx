import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { EnvironmentTestResult } from "../api/types";
import { useOfficeData } from "../state/officeData";

export interface StatusCheck {
  id: string;
  group: "services" | "employees" | "sign-ins" | "tools";
  label: string;
  level: "ok" | "warn" | "bad";
  detail: string;
  fix?: string;
}

const GROUP_TITLE: Record<StatusCheck["group"], string> = {
  services: "🏢 SERVICES",
  employees: "🧑‍💻 EMPLOYEE RUNTIMES",
  "sign-ins": "🔑 SIGN-INS",
  tools: "🧰 TOOLS",
};
export const LEVEL_ICON: Record<StatusCheck["level"], string> = { ok: "🟢", warn: "🟡", bad: "🔴" };

async function fetchStatus(): Promise<{ checkedAt: string; checks: StatusCheck[] }> {
  const res = await fetch("/office-admin/status");
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

/** Shared by the HUD light and the panel so they agree. */
export const useBuildingStatus = () => useQuery({ queryKey: ["building-status"], queryFn: fetchStatus, refetchInterval: 180_000, staleTime: 60_000 });

export function worstLevel(checks: StatusCheck[] | undefined): StatusCheck["level"] | null {
  if (!checks) return null;
  return checks.some((c) => c.level === "bad") ? "bad" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
}

/** One place that says whether everything the office needs is up, with the fix for anything red. */
export function StatusPanel() {
  const { company, toast } = useOfficeData();
  const status = useBuildingStatus();
  const test = useMutation({
    mutationFn: async () => {
      const types = ["claude_local", "copilot_local"];
      return Promise.all(types.map((t) => api.testAdapter(company.id, t).catch((e: Error) => ({ adapterType: t, status: "fail", checks: [{ code: "error", level: "error", message: e.message }], testedAt: "" }) as EnvironmentTestResult)));
    },
    onError: (e: Error) => toast(e.message),
  });
  const checks = status.data?.checks ?? [];
  const groups = (Object.keys(GROUP_TITLE) as StatusCheck["group"][]).filter((g) => checks.some((c) => c.group === g));
  const worst = worstLevel(status.data?.checks);

  return (
    <>
      <div className="px-card">
        <div className="row">
          <h4 style={{ flex: 1, margin: 0 }}>
            {worst ? LEVEL_ICON[worst] : "⏳"} {worst === "ok" ? "ALL SYSTEMS GO" : worst === "warn" ? "WORKING, WITH WARNINGS" : worst === "bad" ? "SOMETHING IS DOWN" : "CHECKING THE BUILDING…"}
          </h4>
          <button className="px-btn small" disabled={status.isFetching} onClick={() => status.refetch()}>
            {status.isFetching ? "Checking…" : "↻ Re-check"}
          </button>
        </div>
        {status.data && <div className="muted" style={{ fontSize: 15 }}>Checked {new Date(status.data.checkedAt).toLocaleTimeString()}</div>}
        {status.error && <div style={{ color: "var(--bad)" }}>{(status.error as Error).message}. Is the office server running?</div>}
      </div>

      {groups.map((g) => (
        <div key={g} className="px-card">
          <h4>{GROUP_TITLE[g]}</h4>
          {checks
            .filter((c) => c.group === g)
            .map((c) => (
              <div key={c.id} className="status-row">
                <span>{LEVEL_ICON[c.level]}</span>
                <span style={{ flex: 1 }}>
                  <b>{c.label}</b>
                  <small style={{ display: "block", fontSize: 16 }}>{c.detail}</small>
                  {c.fix && (
                    <small style={{ display: "block", fontSize: 16 }}>
                      Fix: <code>{c.fix}</code>
                    </small>
                  )}
                </span>
              </div>
            ))}
        </div>
      ))}

      <div className="px-card">
        <h4>🧪 TEST EMPLOYEES</h4>
        <div className="muted" style={{ fontSize: 16 }}>Asks Paperclip to check that Claude Code and Copilot can actually start and are signed in. Takes a few seconds.</div>
        <button className="px-btn small" disabled={test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Testing…" : "Run the tests"}
        </button>
        {test.data?.map((r) => (
          <div key={r.adapterType} style={{ marginTop: 6 }}>
            <b>
              {r.status === "pass" ? "🟢" : r.status === "warn" ? "🟡" : "🔴"} {r.adapterType === "claude_local" ? "Claude Code" : "Copilot"}
            </b>
            {r.checks
              .filter((c) => r.status !== "pass" || c.level !== "info")
              .map((c, i) => (
                <small key={i} style={{ display: "block", fontSize: 16 }}>
                  {c.level === "error" ? "✖" : c.level === "warn" ? "⚠" : "✔"} {c.message}
                  {c.hint ? ` · ${c.hint}` : ""}
                </small>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
