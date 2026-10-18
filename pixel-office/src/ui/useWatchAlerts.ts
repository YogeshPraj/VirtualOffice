import { useEffect, useRef } from "react";
import { useWatches } from "../lib/watches";
import { useOffice } from "../state/officeStore";
import { notifyCeo } from "./useNotifications";

/** Alert when a watched query finds something new (matches already there on load don't alert). */
export function useWatchAlerts() {
  const { data: watches } = useWatches();
  const open = useOffice((s) => s.open);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!watches) return;
    const now = new Set(watches.flatMap((w) => w.pending.map((h) => `${w.id}|${h.url}`)));
    if (seen.current) {
      for (const w of watches) {
        const fresh = w.pending.filter((h) => !seen.current!.has(`${w.id}|${h.url}`));
        if (fresh.length) {
          notifyCeo(
            `${fresh.length} new from "${w.name}"`,
            fresh.slice(0, 3).map((h) => `${h.key} ${h.title}`).join("\n"),
            () => open({ kind: "room", room: "intake" }),
            `watch:${w.id}`,
          );
        }
      }
    }
    seen.current = now;
  }, [watches, open]);
}
