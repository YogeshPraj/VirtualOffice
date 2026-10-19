import { useEffect, useRef } from "react";
import { useOfficeData } from "../state/officeData";
import { useFocus } from "../lib/focus";
import { celebrate, justCompleted } from "./Confetti";

/** Confetti when the last task on the focus list is done (not on load, not twice). */
export function FocusCelebration() {
  const { issues } = useOfficeData();
  const { ids } = useFocus();
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    const pinned = ids.map((id) => issues.find((i) => i.id === id)).filter(Boolean);
    const done = pinned.filter((i) => i!.status === "done").length;
    const complete = pinned.length > 0 && done === pinned.length;
    if (justCompleted(prev.current, done, pinned.length)) celebrate(`Focus list done: all ${pinned.length} priorities finished.`);
    // Only start watching once there's something to compare against.
    if (issues.length) prev.current = complete;
  }, [ids, issues]);
  return null;
}
