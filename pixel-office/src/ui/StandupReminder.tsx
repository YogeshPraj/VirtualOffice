import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { localDay } from "../lib/due";
import { notifyCeo } from "./useNotifications";

const PREF = "pixel-office:standup";
const SHOWN = "pixel-office:standup-shown";
const EVENT = "pixel-office:standup-pref";

interface Hours {
  settings: { enabled: boolean; days: number[]; start: string };
}

export function standupPrefOn(): boolean {
  try {
    return localStorage.getItem(PREF) !== "off";
  } catch {
    return true;
  }
}

/** Is it time for today's reminder? On a working day, at or after the start of the day. */
export function standupDue(now: Date, hours: Hours["settings"] | undefined, shownOn: string | null): boolean {
  const days = hours?.enabled ? hours.days : [1, 2, 3, 4, 5];
  const start = hours?.enabled ? hours.start : "09:00";
  if (!days.includes(now.getDay()) || shownOn === localDay(now)) return false;
  const [h, m] = start.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  // Only within the first three hours of the day: opening the office at 4pm shouldn't "remind".
  return mins >= h * 60 + m && mins < h * 60 + m + 180;
}

export function useStandupPref() {
  const [on, setOn] = useState(standupPrefOn);
  useEffect(() => {
    const f = () => setOn(standupPrefOn());
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
  return {
    on,
    toggle: () => {
      try {
        localStorage.setItem(PREF, on ? "off" : "on");
      } catch {
        /* not kept */
      }
      window.dispatchEvent(new Event(EVENT));
    },
  };
}

/** Once each working morning: "your stand-up is ready", with yesterday's numbers. */
export function StandupReminder() {
  const { issues, attention, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { on } = useStandupPref();
  const { data: hours } = useQuery({
    queryKey: ["working-hours"],
    queryFn: async () => (await (await fetch("/office-admin/working-hours")).json()) as Hours,
    retry: false,
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!on) return;
    let shown: string | null = null;
    try {
      shown = localStorage.getItem(SHOWN);
    } catch {
      return;
    }
    if (!standupDue(now, hours?.settings, shown)) return;
    try {
      localStorage.setItem(SHOWN, localDay(now));
    } catch {
      return;
    }
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    y.setHours(0, 0, 0, 0);
    const doneYesterday = issues.filter((i) => i.status === "done" && i.completedAt && Date.parse(i.completedAt) >= y.getTime() && Date.parse(i.completedAt) < y.getTime() + 86_400_000).length;
    const doing = issues.filter((i) => i.status === "in_progress").length;
    const body = `${doneYesterday} done yesterday · ${doing} in progress · ${attention.length} waiting on you`;
    notifyCeo("📰 Your stand-up is ready", body, () => open({ kind: "room", room: "report" }), "standup");
    toast(`📰 Good morning. ${body}. Open Today (g t) for the full report.`);
  }, [now, on, hours, issues, attention, open, toast]);
  return null;
}
