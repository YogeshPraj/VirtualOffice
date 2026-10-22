import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Markdown } from "../lib/markdown";
import { useOfficeLinks } from "../panels/TaskDocuments";
import { useOfficeData } from "../state/officeData";
import { linkIdentifiers } from "./AskOffice";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** True on the first visit of a new day (the office was last open on an earlier day). */
export function firstVisitToday(lastSeen: number | null, now = new Date()): boolean {
  return lastSeen !== null && lastSeen > 0 && localDay(new Date(lastSeen)) !== localDay(now);
}

/** Today's briefing, written by the office's AI once a day; shown at the top of the welcome-back window. */
export function MorningBriefing({ since, onOpenItem }: { since: number; onOpenItem: () => void }) {
  const { company, attention } = useOfficeData();
  const links = useOfficeLinks();
  const qc = useQueryClient();
  const key = ["briefing", company.id, localDay()];
  const { data, error, isFetching } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch("/office-admin/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, since, waiting: attention.map((a) => `${a.subject.identifier ?? ""} ${a.subject.title}`.trim()) }),
      });
      const d = (await r.json()) as { text?: string; at?: string; error?: string };
      if (!r.ok || !d.text) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d as { text: string; at: string };
    },
    staleTime: Infinity,
    retry: false,
  });
  const redo = async () => {
    const r = await fetch("/office-admin/briefing?force=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, since }) });
    if (r.ok) qc.setQueryData(key, await r.json());
  };
  return (
    <div className="px-card briefing" aria-label="Morning briefing" style={{ borderLeft: "8px solid var(--accent)", margin: "0 0 8px" }}>
      <div className="row" style={{ margin: 0 }}>
        <h5 className="px-label" style={{ flex: 1, margin: 0 }}>☀ MORNING BRIEFING</h5>
        {data && (
          <button className="px-btn small" disabled={isFetching} onClick={() => void redo()} title="Write it again from the latest records">
            ↻
          </button>
        )}
      </div>
      {isFetching && !data && <div className="muted">Reading the overnight records… (up to a minute)</div>}
      {error && <div className="muted">No briefing today: {(error as Error).message}</div>}
      {data && (
        <div style={{ fontSize: 16 }}>
          <Markdown text={linkIdentifiers(data.text, company.issuePrefix)} links={{ ...links, issue: (id) => (onOpenItem(), links.issue?.(id) ?? false) }} />
        </div>
      )}
    </div>
  );
}
