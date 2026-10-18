import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

interface BackupStatus {
  repo: boolean;
  lastExportAt?: string | null;
  lastCommitAt?: string | null;
  lastCommit?: string | null;
  pending?: number;
  remote?: string | null;
  settings?: { backedUp: string[]; missingHere: string[] };
}

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Export the company to the private company repo, and optionally commit and push it. */
export function BackupCard() {
  const { company, toast } = useOfficeData();
  const status = useQuery({
    queryKey: ["backup-status"],
    queryFn: async () => (await fetch("/office-admin/backup")).json() as Promise<BackupStatus>,
    refetchInterval: 300_000,
  });
  const [commit, setCommit] = useState(true);
  const [push, setPush] = useState(true);
  const backup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/office-admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, commit, push: commit && push }),
      });
      const data = (await res.json().catch(() => ({}))) as { steps?: { step: string; ok: boolean; detail: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Backup failed (${res.status})`);
      return data.steps ?? [];
    },
    onSuccess: (steps) => {
      status.refetch();
      toast(steps.every((s) => s.ok) ? "Backed up." : "Backup finished with a problem; see the steps.");
    },
    onError: (e: Error) => toast(e.message),
  });

  const s = status.data;
  const stale = s?.repo && (!s.lastCommitAt || Date.now() - Date.parse(s.lastCommitAt) > 7 * 86_400_000);
  return (
    <div className="px-card">
      <h4>💾 BACKUP</h4>
      {!s && <div className="muted">Checking…</div>}
      {s && !s.repo && (
        <div>
          No private company repo at <code>company/</code>. Create a private GitHub repo and clone it there so your org chart, agent instructions and
          handbook are backed up (the live database itself is never committed).
        </div>
      )}
      {s?.repo && (
        <>
          <div className="status-row">
            <span>{stale ? "🟡" : "🟢"}</span>
            <span style={{ flex: 1 }}>
              <b>Last backup {ago(s.lastCommitAt)}</b>
              <small style={{ display: "block", fontSize: 16 }}>
                Export refreshed {ago(s.lastExportAt)} · {s.pending ? `${s.pending} change(s) not committed` : "everything committed"}
                {s.remote ? ` · ${s.remote.replace(/^https:\/\/github\.com\//, "github: ")}` : ""}
              </small>
            </span>
          </div>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="checkbox" checked={commit} onChange={(e) => setCommit(e.target.checked)} /> Commit to the company repo
          </label>
          <label style={{ display: "block", cursor: "pointer", opacity: commit ? 1 : 0.5 }}>
            <input type="checkbox" checked={push && commit} disabled={!commit} onChange={(e) => setPush(e.target.checked)} /> and push it to the private remote
          </label>
          <button className="px-btn small primary" disabled={backup.isPending} onClick={() => backup.mutate()}>
            {backup.isPending ? "Backing up… (about a minute)" : "💾 Back up now"}
          </button>
          {backup.data?.map((st, i) => (
            <small key={i} style={{ display: "block", fontSize: 16, whiteSpace: "pre-wrap", color: st.ok ? undefined : "var(--bad)" }}>
              {st.ok ? "✔" : "✖"} {st.step}: {st.detail}
            </small>
          ))}
          {s.settings && s.settings.missingHere.length > 0 && (
            <div className="row" style={{ marginTop: 6 }}>
              <span style={{ flex: 1, fontSize: 16 }}>
                The company repo has office settings this PC doesn't: {s.settings.missingHere.map((n) => n.replace(".json", "")).join(", ")}.
              </span>
              <button
                className="px-btn small"
                onClick={async () => {
                  const r = (await (await fetch("/office-admin/backup/restore-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()) as { restored?: string[] };
                  toast(r.restored?.length ? `Restored ${r.restored.join(", ")}. Reload to see them.` : "Nothing to restore.");
                  status.refetch();
                }}
              >
                ⤓ Restore them
              </button>
            </div>
          )}
          <div className="muted" style={{ fontSize: 15 }}>
            Secret values are never exported, and a commit is refused if a changed file looks like it holds one. Templates, watched queries, working hours and saved views are
            backed up too.
          </div>
        </>
      )}
    </div>
  );
}
