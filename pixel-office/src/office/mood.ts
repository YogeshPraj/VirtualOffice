import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Company } from "../api/types";

export type Mood = "day" | "dusk" | "night";

interface HoursState {
  settings: { enabled: boolean };
  now: { inHours: boolean; nextChange: string | null };
}

/** Night when the company is closed or it's after working hours; dusk on a late evening clock. */
export function moodFor(company: Pick<Company, "status">, hours: HoursState | undefined, now: Date): { mood: Mood; why: string | null; reopens: string | null } {
  const afterHours = !!hours?.settings.enabled && !hours.now.inHours;
  if (company.status === "paused" || afterHours) {
    const reopens = afterHours && hours?.now.nextChange ? hours.now.nextChange : null;
    return { mood: "night", why: company.status === "paused" ? "The office is closed" : "After hours", reopens };
  }
  const h = now.getHours();
  return { mood: h >= 20 || h < 6 ? "dusk" : "day", why: null, reopens: null };
}

export function useOfficeMood(company: Company) {
  const { data: hours } = useQuery({
    queryKey: ["working-hours"],
    queryFn: async () => (await fetch("/office-admin/working-hours")).json() as Promise<HoursState>,
    refetchInterval: 60_000,
    retry: false,
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return moodFor(company, hours, now);
}
