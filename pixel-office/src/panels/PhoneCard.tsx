import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

interface Phone {
  enabled: boolean;
  running: boolean;
  address: string | null;
  port: number;
  reason: string | null;
  link: string | null;
}
const KEY = ["phone"] as const;

/** Turn the phone view on or off, and get the one-time link for your phone. */
export function PhoneCard() {
  const { toast } = useOfficeData();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await (await fetch("/office-admin/phone")).json()) as Phone, refetchInterval: 60_000 });
  const change = useMutation({
    mutationFn: async (what: "on" | "off" | "new") => {
      const r = await fetch(what === "new" ? "/office-admin/phone/regenerate" : "/office-admin/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: what === "new" ? "{}" : JSON.stringify({ enabled: what === "on" }),
      });
      const d = (await r.json()) as Phone & { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d;
    },
    onSuccess: (d, what) => {
      qc.setQueryData(KEY, d);
      setLink(d.link);
      toast(what === "off" ? "Phone view is off; the link no longer works." : d.running ? "Phone view is on. Open the link on your phone once." : (d.reason ?? "Phone view is set up."));
    },
    onError: (e: Error) => toast(e.message),
  });
  if (!data) return null;
  return (
    <div className="px-card" aria-label="Phone view">
      <h4>📱 PHONE VIEW</h4>
      <div style={{ fontSize: 16 }}>
        Clear the review queue and answer what's waiting from your phone. It only listens on your private Tailscale network
        {data.address ? ` (${data.address}:${data.port})` : ""}, needs the secret link, and can only read the queue, approve, send back and comment.
      </div>
      <div style={{ fontSize: 16, margin: "4px 0" }}>
        {data.running ? "🟢 On." : data.enabled ? `🟡 On, but not listening: ${data.reason ?? "waiting for Tailscale."}` : "⚪ Off."}
      </div>
      {link && (
        <div className="phone-link" style={{ fontSize: 15, wordBreak: "break-all" }}>
          Your phone link (shown once, keep it private): <code>{link}</code>{" "}
          <button className="px-btn small" onClick={() => void navigator.clipboard.writeText(link).then(() => toast("Copied. Send it to your phone privately, e.g. in a note to yourself."))}>
            ⧉ Copy
          </button>
        </div>
      )}
      <div className="row">
        {data.enabled ? (
          <>
            <button className="px-btn small" disabled={change.isPending} onClick={() => confirm("Make a new link? The old one stops working on every phone.") && change.mutate("new")}>
              New link
            </button>
            <button className="px-btn small" disabled={change.isPending} onClick={() => change.mutate("off")}>
              Turn off
            </button>
          </>
        ) : (
          <button className="px-btn small" disabled={change.isPending} onClick={() => confirm("Turn on the phone view? Anyone with the link, on your Tailscale network, can approve and send back tasks.") && change.mutate("on")}>
            Turn on
          </button>
        )}
      </div>
      {!data.address && <div className="muted" style={{ fontSize: 14 }}>Needs Tailscale on this PC and your phone (free for personal use), signed in to the same account.</div>}
    </div>
  );
}
