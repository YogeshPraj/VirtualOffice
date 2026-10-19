import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

interface Finding {
  issueId: string;
  identifier: string;
  where: "description" | "comment" | "document";
  ref: string | null;
  label: string;
  preview: string;
  at: string | null;
}
interface Scan {
  scannedAt: string | null;
  findings: Finding[];
  scanned: number;
  error: string | null;
  running: boolean;
}

const KEY = ["leaks"] as const;

/** Secrets pasted into tasks: where they are, and the fix. */
export function LeakWatchCard() {
  const { toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await (await fetch("/office-admin/leaks")).json()) as Scan, refetchInterval: 300_000 });
  const scan = useMutation({
    mutationFn: async () => (await (await fetch("/office-admin/leaks/scan", { method: "POST" })).json()) as Scan,
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      qc.invalidateQueries({ queryKey: ["building-status"] });
      toast(d.findings.length ? `Found ${d.findings.length} possible secret(s).` : `No secrets found in ${d.scanned} tasks.`);
    },
  });
  const remove = useMutation({
    mutationFn: async (f: Finding) => {
      const res = await fetch(`/api/issues/${f.issueId}/comments/${f.ref}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Couldn't delete the comment (${res.status}).`);
    },
    onSuccess: () => {
      toast("Comment deleted. Rotate that secret too: it may have been copied already.");
      scan.mutate();
    },
    onError: (e: Error) => toast(e.message),
  });

  const findings = data?.findings ?? [];
  return (
    <div className="px-card" style={findings.length ? { borderLeft: "8px solid var(--bad)" } : undefined}>
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>🔐 LEAK WATCH</h4>
        <button className="px-btn small" disabled={scan.isPending || data?.running} onClick={() => scan.mutate()}>
          {scan.isPending || data?.running ? "Scanning…" : "↻ Scan now"}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 15 }}>
        Looks through every task's details, thread and documents for pasted tokens, keys and passwords (every 6 hours, and on demand).
        {data?.scannedAt ? ` Last scan ${new Date(data.scannedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}, ${data.scanned} tasks.` : " Not scanned yet."}
      </div>
      {data?.error && <div style={{ color: "var(--bad)", fontSize: 15 }}>{data.error}</div>}
      {data?.scannedAt && !findings.length && <div style={{ fontSize: 16, marginTop: 4 }}>🟢 No secrets found.</div>}
      {findings.map((f, i) => (
        <div key={i} className="status-row">
          <span>🔴</span>
          <span style={{ flex: 1, fontSize: 16 }}>
            <b>{f.label}</b> in {f.identifier}'s {f.where === "document" ? `“${f.ref}” document` : f.where}: <code>{f.preview}</code>
            <small className="muted" style={{ display: "block", fontSize: 14 }}>
              {f.where === "comment" ? "Delete the comment, then rotate the secret where it came from." : "Edit it out, then rotate the secret where it came from."}
            </small>
          </span>
          <button className="px-btn small" onClick={() => open({ kind: "issue", issueId: f.issueId })}>Open</button>
          {f.where === "comment" && f.ref && (
            <button className="px-btn small bad" disabled={remove.isPending} onClick={() => confirm(`Delete this comment on ${f.identifier}? This can't be undone.`) && remove.mutate(f)}>
              Delete comment
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
