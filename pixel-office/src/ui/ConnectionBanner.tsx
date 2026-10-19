import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const CHECK_MS = 10_000;

export interface WatchedService {
  failures: number;
  restarts: number[];
  wasDown: boolean;
  gaveUp: boolean;
}

const at = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** What to tell the CEO while Paperclip isn't answering; null when all is well. */
export function connectionMessage(apiUp: boolean, paperclip: WatchedService | null | "unreachable", now = Date.now()): string | null {
  if (apiUp) return null;
  if (paperclip === "unreachable") return "The office server isn't answering either. Reopen the office from the desktop icon.";
  if (paperclip?.gaveUp) return "Paperclip keeps stopping, so the watchdog stopped restarting it. Start it from the desktop icon (or start-paperclip.ps1).";
  const last = paperclip?.restarts.at(-1);
  if (last && now - last < 5 * 60_000) return `Paperclip isn't answering. The watchdog restarted it at ${at(last)}; it's usually back within a minute.`;
  return "Paperclip isn't answering. The watchdog restarts it if it doesn't come back in a minute or so.";
}

/** A banner across the top when Paperclip can't be reached, and a refresh when it's back. */
export function ConnectionBanner() {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  const misses = useRef(0);
  const down = useRef(false);

  useEffect(() => {
    let alive = true;
    let hideBack: ReturnType<typeof setTimeout>;
    const check = async () => {
      const ok = await fetch("/api/health", { signal: AbortSignal.timeout(5_000) }).then((r) => r.ok).catch(() => false);
      if (!alive) return;
      if (ok) {
        misses.current = 0;
        if (down.current) {
          down.current = false;
          setMessage(null);
          setBack(true);
          clearTimeout(hideBack);
          hideBack = setTimeout(() => setBack(false), 4_000);
          void qc.invalidateQueries(); // everything on screen may be stale
        }
        return;
      }
      // One miss is a blip; two in a row is an outage.
      if (++misses.current < 2) return;
      down.current = true;
      setBack(false);
      const dog = await fetch("/office-admin/watchdog", { signal: AbortSignal.timeout(5_000) })
        .then((r) => r.json() as Promise<{ services: ({ id: string } & WatchedService)[] }>)
        .then((d) => d.services.find((s) => s.id === "paperclip") ?? null)
        .catch(() => "unreachable" as const);
      if (alive) setMessage(connectionMessage(false, dog));
    };
    const t = setInterval(check, CHECK_MS);
    return () => {
      alive = false;
      clearInterval(t);
      clearTimeout(hideBack);
    };
  }, [qc]);

  if (message)
    return (
      <div className="conn-banner down" role="alert">
        🔌 {message} <span style={{ opacity: 0.8 }}>Changes you make now may not save.</span>
      </div>
    );
  if (back)
    return (
      <div className="conn-banner up" role="status">
        ✅ Paperclip is back. Refreshing the office.
      </div>
    );
  return null;
}
