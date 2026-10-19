import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { machineWarning, type MachineState } from "../lib/machine";
import { useOfficeData } from "../state/officeData";

const KEY = ["machine"] as const;

/** "The laptop backed up after this copy: pull first." Across the top until pulled or put off. */
export function MachineBanner() {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const [later, setLater] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await (await fetch("/office-admin/machine")).json()) as MachineState, refetchInterval: 5 * 60_000 });
  const pull = useMutation({
    mutationFn: async () => (await (await fetch("/office-admin/machine/pull", { method: "POST" })).json()) as { ok: boolean; detail: string; state: MachineState },
    onSuccess: (r) => {
      qc.setQueryData(KEY, r.state);
      qc.invalidateQueries({ queryKey: ["backup-status"] });
      toast(r.detail);
    },
    onError: (e: Error) => toast(e.message),
  });
  const warning = data ? machineWarning(data) : null;
  // "Later" lasts until something new arrives from the other machine.
  if (!data || !warning || later === data.lastRemote?.at) return null;
  return (
    <div className="conn-banner down" role="alert">
      <div className="row" style={{ margin: 0 }}>
        <span style={{ flex: 1 }}>🖥 {warning}</span>
        {!data.ahead && (
          <button className="px-btn small" disabled={pull.isPending} onClick={() => pull.mutate()}>
            {pull.isPending ? "Pulling…" : "⬇ Pull now"}
          </button>
        )}
        <button className="px-btn small" onClick={() => setLater(data.lastRemote?.at ?? "")}>Later</button>
      </div>
    </div>
  );
}
