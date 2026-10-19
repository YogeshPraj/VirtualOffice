import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Check {
  id: string;
  label: string;
  level: "ok" | "warn" | "bad";
  detail: string;
  fix?: string;
}
interface Result {
  checkedAt: string;
  checks: Check[];
}

const KEY = ["setup-check"] as const;
const DOT = { ok: "🟢", warn: "🟡", bad: "🔴" } as const;

/** Is this machine ready? Tools, sign-ins and services, each with its fix. */
export function SetupCheckCard() {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const { data, isFetching } = useQuery({ queryKey: KEY, queryFn: async () => (await (await fetch("/office-admin/setup-check")).json()) as Result, staleTime: 60_000 });
  const recheck = async () => qc.setQueryData(KEY, (await (await fetch("/office-admin/setup-check?force=1")).json()) as Result);
  const checks = data?.checks ?? [];
  const problems = checks.filter((c) => c.level !== "ok");
  const bad = checks.some((c) => c.level === "bad");
  const shown = all ? checks : problems;
  return (
    <div id="setup-check" className="px-card" style={bad ? { borderLeft: "8px solid var(--bad)" } : undefined}>
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🧰 SETUP CHECK</h4>
        <button className="px-btn small" disabled={isFetching} onClick={() => void recheck()}>
          {isFetching ? "Checking…" : "↻ Check again"}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 15 }}>
        Is this machine ready to run the office? {data ? (problems.length ? `${problems.length} of ${checks.length} need a look.` : `All ${checks.length} checks pass.`) : "Checking…"}
      </div>
      {shown.map((c) => (
        <div key={c.id} className="status-row">
          <span>{DOT[c.level]}</span>
          <span style={{ flex: 1, fontSize: 16 }}>
            <b>{c.label}</b>: {c.detail}
            {c.fix && c.level !== "ok" && (
              <small className="muted" style={{ display: "block", fontSize: 14 }}>
                Fix: {c.fix}
              </small>
            )}
          </span>
        </div>
      ))}
      {checks.length > 0 && (
        <button className="link-btn" style={{ fontSize: 15 }} onClick={() => setAll((a) => !a)}>
          {all ? "Show only what needs a look" : `Show all ${checks.length} checks`}
        </button>
      )}
    </div>
  );
}
