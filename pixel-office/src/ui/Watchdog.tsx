import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { notifyCeo } from "./useNotifications";

interface WatchEvent {
  at: string;
  service: string;
  action: "restarted" | "recovered" | "gave-up" | "restart-failed";
  detail: string;
}

const ICON: Record<WatchEvent["action"], string> = { restarted: "🔄", recovered: "🟢", "gave-up": "🔴", "restart-failed": "🔴" };

export const useWatchdog = () =>
  useQuery({
    queryKey: ["watchdog"],
    queryFn: async () => (await (await fetch("/office-admin/watchdog")).json()) as { events: WatchEvent[] },
    refetchInterval: 60_000,
    retry: false,
  });

/** Tell the CEO when the office restarted (or couldn't restart) one of its services. */
export function WatchdogAlerts() {
  const { toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { data } = useWatchdog();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const keys = data.events.map((e) => `${e.at}|${e.service}|${e.action}`);
    if (seen.current) {
      const fresh = data.events.filter((e, i) => !seen.current!.has(keys[i]) && e.action !== "recovered");
      for (const e of fresh.slice(0, 2)) {
        notifyCeo(`${ICON[e.action]} Office`, e.detail, () => open({ kind: "room", room: "status" }), `watchdog:${e.service}`);
        toast(`${ICON[e.action]} ${e.detail}`);
      }
    }
    seen.current = new Set(keys);
  }, [data, open, toast]);
  return null;
}

/** Building status: what self-healing has done lately. */
export function WatchdogCard() {
  const { data } = useWatchdog();
  const events = data?.events ?? [];
  return (
    <div className="px-card">
      <h4>🩹 SELF-HEALING</h4>
      <div className="muted" style={{ fontSize: 15 }}>
        If Paperclip or the brain stops (the PC slept, a crash), the office starts it again within about two minutes. Nobody needs to double-click anything.
      </div>
      {events.length === 0 && <div style={{ fontSize: 16, marginTop: 4 }}>Nothing has needed restarting since the office started.</div>}
      {events.slice(0, 8).map((e, i) => (
        <div key={i} className="status-row" style={{ margin: "3px 0" }}>
          <span>{ICON[e.action]}</span>
          <span style={{ flex: 1, fontSize: 16 }}>
            {e.detail}
            <small className="muted" style={{ display: "block", fontSize: 14 }}>
              {new Date(e.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
