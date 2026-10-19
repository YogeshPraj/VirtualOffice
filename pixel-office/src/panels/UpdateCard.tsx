import { useMutation, useQuery } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

export interface UpdateStatus {
  branch: string;
  behind: number;
  ahead: number;
  dirty: number;
  commits: { hash: string; subject: string }[];
  needsSetup: boolean;
  error?: string | null;
}

export const useUpdateStatus = () =>
  useQuery({
    queryKey: ["office-update"],
    queryFn: async () => (await (await fetch("/office-admin/update")).json()) as UpdateStatus,
    refetchInterval: 30 * 60_000,
    retry: false,
  });

/** "A newer office is available": what changed, and a one-click fast-forward update. */
export function UpdateCard() {
  const { toast } = useOfficeData();
  const status = useUpdateStatus();
  const update = useMutation({
    mutationFn: async () => {
      const res = await fetch("/office-admin/update", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; to?: string; needsSetup?: boolean };
      if (!data.ok) throw new Error(data.error ?? "Update failed");
      return data;
    },
    onSuccess: (d) => {
      // Remember what we came from, so "What's new" can show the changes after the reload.
      try {
        localStorage.setItem("pixel-office:updated-from", JSON.stringify({ commits: status.data?.commits ?? [], at: Date.now() }));
      } catch {
        /* fine */
      }
      toast(d.needsSetup ? "Updated. Run setup.ps1 again (new packages or adapters), then restart the office." : "Updated. Reloading…");
      if (!d.needsSetup) setTimeout(() => location.reload(), 2500);
    },
    onError: (e: Error) => toast(e.message),
  });

  const s = status.data;
  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>⬆ OFFICE UPDATES</h4>
        <button
          className="px-btn small"
          disabled={status.isFetching}
          onClick={async () => {
            await fetch("/office-admin/update?force=1");
            status.refetch();
          }}
        >
          {status.isFetching ? "Checking…" : "↻ Check now"}
        </button>
      </div>
      {!s && <div className="muted">Checking GitHub…</div>}
      {s?.error && <div className="muted" style={{ fontSize: 16 }}>{s.error}</div>}
      {s && !s.behind && !s.error && <div style={{ fontSize: 17 }}>🟢 You have the latest office ({s.branch}).</div>}
      {s && s.behind > 0 && (
        <>
          <div style={{ fontSize: 17 }}>
            🆕 {s.behind} update{s.behind === 1 ? "" : "s"} available{s.needsSetup ? " (needs setup.ps1 afterwards)" : ""}:
          </div>
          <ul style={{ margin: "4px 0", paddingLeft: 20, fontSize: 16, maxHeight: 180, overflowY: "auto" }}>
            {s.commits.map((c) => (
              <li key={c.hash}>{c.subject}</li>
            ))}
          </ul>
          {s.dirty > 0 && <div style={{ color: "var(--bad)", fontSize: 16 }}>This copy has {s.dirty} local change(s); updating needs a clean copy.</div>}
          <button className="px-btn small primary" disabled={update.isPending || s.dirty > 0} onClick={() => confirm("Update the office to the newest version now?") && update.mutate()}>
            {update.isPending ? "Updating…" : "⬆ Update now"}
          </button>
        </>
      )}
      {s && s.ahead > 0 && <div className="muted" style={{ fontSize: 15 }}>This copy also has {s.ahead} commit(s) GitHub doesn't.</div>}
    </div>
  );
}
