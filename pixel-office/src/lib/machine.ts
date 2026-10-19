/** Two-machine safety, shared by the office server (machine-sync.ts) and the banner. */

export interface MachineState {
  machine: string;
  repo: boolean;
  behind: number;
  ahead: number;
  dirty: number;
  lastRemote: { machine: string | null; at: string; subject: string } | null;
  checkedAt: string | null;
  error: string | null;
}

/** What to tell the CEO, or null when this copy is current. */
export function machineWarning(s: Pick<MachineState, "machine" | "behind" | "ahead" | "lastRemote">): string | null {
  if (s.behind <= 0) return null;
  if (s.ahead > 0) return `Both machines backed up the company separately (${s.behind} commit${s.behind === 1 ? "" : "s"} there, ${s.ahead} here). Merge them in company/ with git before backing up again.`;
  const other = s.lastRemote?.machine && s.lastRemote.machine !== s.machine ? s.lastRemote.machine : null;
  const when = s.lastRemote ? new Date(s.lastRemote.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : null;
  return other
    ? `${other} backed up the company${when ? ` at ${when}` : ""}, after this machine's copy. Pull first, so you don't work from (or back up over) an old copy.`
    : `The company repo has ${s.behind} newer commit${s.behind === 1 ? "" : "s"} than this machine's copy. Pull first.`;
}
