/** Ready-made schedules for routines: [id, label, cron]. */
export const SCHEDULES: [string, string, string][] = [
  ["none", "No schedule (run by hand)", ""],
  ["hourly", "Every hour", "0 * * * *"],
  ["daily", "Every day at 9:00", "0 9 * * *"],
  ["weekdays", "Weekdays at 9:00", "0 9 * * 1-5"],
  ["weekly", "Mondays at 9:00", "0 9 * * 1"],
  ["friday", "Fridays at 16:00", "0 16 * * 5"],
  ["monthly", "1st of the month at 9:00", "0 9 1 * *"],
  ["custom", "Custom cron…", ""],
];

export function describeCron(cron: string | null): string {
  if (!cron) return "manual";
  return SCHEDULES.find(([, , c]) => c === cron)?.[1] ?? `cron ${cron}`;
}

/** The cron for a schedule id ("custom" uses `custom`); null when there's no schedule. */
export function cronFor(id: string, custom = ""): string | null {
  if (id === "custom") return /^\s*\S+(\s+\S+){4}\s*$/.test(custom) ? custom.trim() : null;
  return SCHEDULES.find(([s]) => s === id)?.[2] || null;
}
