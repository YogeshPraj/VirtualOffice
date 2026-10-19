import { useEffect } from "react";
import type { Issue } from "../api/types";
import { daysUntil, localDay, useDue } from "../lib/due";
import { useOffice } from "../state/officeStore";
import { useOfficeData } from "../state/officeData";
import { notifyCeo } from "./useNotifications";

const KEY = "pixel-office:due-alerts";

/** Tasks to remind about today: due tomorrow, due today, or overdue, and still open. */
export function dueReminders(issues: Pick<Issue, "id" | "status" | "identifier" | "title">[], due: Record<string, string>, now = new Date()) {
  return issues
    .filter((i) => due[i.id] && i.status !== "done" && i.status !== "cancelled")
    .map((i) => ({ issue: i, days: daysUntil(due[i.id], now) }))
    .filter((x) => x.days <= 1)
    .sort((a, b) => a.days - b.days);
}

/** Once a day, one alert listing what's due tomorrow, today or overdue. */
export function DueAlerts() {
  const { issues, toast } = useOfficeData();
  const { due } = useDue();
  const open = useOffice((s) => s.open);
  useEffect(() => {
    const list = dueReminders(issues, due);
    if (!list.length) return;
    const today = localDay();
    let last: string | null = null;
    try {
      last = localStorage.getItem(KEY);
    } catch {
      /* fine */
    }
    if (last === today) return;
    try {
      localStorage.setItem(KEY, today);
    } catch {
      /* may remind again after a reload */
    }
    const overdue = list.filter((x) => x.days < 0).length;
    const head = overdue ? `${overdue} overdue` : list.some((x) => x.days === 0) ? "Due today" : "Due tomorrow";
    const body = list
      .slice(0, 4)
      .map((x) => `${x.issue.identifier} ${x.issue.title}`)
      .join("\n");
    notifyCeo(`⏰ ${head}`, body, () => open({ kind: "room", room: "meeting" }), "due");
    toast(`⏰ ${list.length} task${list.length === 1 ? "" : "s"} due soon or overdue: ${list.slice(0, 3).map((x) => x.issue.identifier).join(", ")}.`);
    // Only on first look each day: issues/due changing later in the day shouldn't re-alert.
  }, [issues.length > 0, Object.keys(due).length]);
  return null;
}
