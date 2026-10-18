import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../api/hooks";
import { useOfficeData } from "../state/officeData";

interface HoursSettings {
  enabled: boolean;
  days: number[];
  start: string;
  end: string;
}
interface HoursState {
  settings: HoursSettings;
  now: { inHours: boolean; nextChange: string | null };
  closedByOffice: string[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function call(method: "GET" | "PUT", body?: HoursSettings): Promise<HoursState> {
  const res = await fetch("/office-admin/working-hours", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Working hours failed (${res.status})`);
  return data as HoursState;
}

/** Close the company outside set hours; reopen it at the start of the day. */
export function WorkingHoursCard() {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["working-hours"], queryFn: () => call("GET"), refetchInterval: 60_000 });
  const [draft, setDraft] = useState<HoursSettings | null>(null);
  useEffect(() => {
    if (data && !draft) setDraft(data.settings);
  }, [data, draft]);
  const save = useMutation({
    mutationFn: (s: HoursSettings) => call("PUT", s),
    onSuccess: (d) => {
      qc.setQueryData(["working-hours"], d);
      setDraft(d.settings);
      toast(d.settings.enabled ? "Working hours set." : "Working hours off: the office stays open.");
      // The office may close or reopen within a moment.
      setTimeout(() => qc.invalidateQueries({ queryKey: keys.companies }), 1500);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (error) return <div className="px-card">Working hours unavailable: {(error as Error).message}</div>;
  if (!data || !draft) return <div className="px-card muted">Checking the clock…</div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const next = data.now.nextChange ? new Date(data.now.nextChange) : null;

  return (
    <div className="px-card">
      <h4>🕘 WORKING HOURS</h4>
      <label style={{ display: "block", margin: "4px 0", cursor: "pointer" }}>
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Close the office outside these hours
      </label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {DAY_LABELS.map((d, i) => (
          <label key={d} className="day-pick">
            <input
              type="checkbox"
              checked={draft.days.includes(i)}
              onChange={(e) => setDraft({ ...draft, days: e.target.checked ? [...draft.days, i].sort() : draft.days.filter((x) => x !== i) })}
            />
            {d}
          </label>
        ))}
      </div>
      <div className="row">
        <label className="px-label" htmlFor="wh-start" style={{ margin: 0 }}>FROM</label>
        <input id="wh-start" type="time" className="px-input" style={{ width: "auto", margin: 0 }} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        <label className="px-label" htmlFor="wh-end" style={{ margin: 0 }}>TO</label>
        <input id="wh-end" type="time" className="px-input" style={{ width: "auto", margin: 0 }} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
      </div>
      <div className="muted" style={{ fontSize: 16, margin: "4px 0" }}>
        After hours nobody picks up new work; a shift already running finishes first. The office opens again at the start time. If you close the
        office yourself, it stays closed. An end time before the start means an overnight shift.
      </div>
      {data.settings.enabled && (
        <div style={{ fontSize: 17 }}>
          {data.now.inHours ? "☀ Open now" : "🌙 After hours now"}
          {next ? ` · ${data.now.inHours ? "closes" : "opens"} ${next.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          {data.closedByOffice.length > 0 && <span className="muted"> · closed by the clock: {data.closedByOffice.join(", ")}</span>}
        </div>
      )}
      <button className="px-btn primary small" disabled={!dirty || save.isPending || draft.days.length === 0} onClick={() => save.mutate(draft)}>
        Save hours
      </button>
    </div>
  );
}
