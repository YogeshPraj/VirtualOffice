import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

interface Autostart {
  supported: boolean;
  enabled: boolean;
}

/** Open the office automatically when you sign in to Windows. */
export function AutostartCard() {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["autostart"], queryFn: async () => (await (await fetch("/office-admin/autostart")).json()) as Autostart });
  const set = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/office-admin/autostart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const d = (await res.json()) as Autostart & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Couldn't change it.");
      return d;
    },
    onSuccess: (d) => {
      qc.setQueryData(["autostart"], d);
      toast(d.enabled ? "The office will open when you sign in to Windows." : "The office won't open by itself any more.");
    },
    onError: (e: Error) => toast(e.message),
  });
  if (!data?.supported) return null;
  return (
    <div className="px-card">
      <h4>🪟 START WITH WINDOWS</h4>
      <label style={{ display: "block", cursor: "pointer", fontSize: 17 }}>
        <input type="checkbox" checked={data.enabled} disabled={set.isPending} onChange={(e) => set.mutate(e.target.checked)} /> Open the office when I sign in
      </label>
      <div className="muted" style={{ fontSize: 15 }}>
        Adds the same shortcut as the desktop icon to your Startup folder: the brain, Paperclip and the office start, and the window opens.
      </div>
    </div>
  );
}
