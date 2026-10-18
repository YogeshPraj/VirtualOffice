import { useEffect, useState } from "react";
import { useOffice, type RoomId } from "../state/officeStore";

/** "g" then a letter jumps to a room. */
export const GO_KEYS: Record<string, { room: RoomId; label: string }> = {
  b: { room: "meeting", label: "Task board" },
  i: { room: "ceo", label: "Inbox (CEO office)" },
  t: { room: "report", label: "Today" },
  d: { room: "intake", label: "Intake desk" },
  s: { room: "study", label: "Study (second brain)" },
  h: { room: "hr", label: "HR · hiring" },
  f: { room: "finance", label: "Finance" },
  l: { room: "lounge", label: "Lounge (#general)" },
  u: { room: "status", label: "Building status" },
  r: { room: "review", label: "Review room" },
};

export const FOCUS_NEW_TASK = "pixel-office:new-task";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Single-key shortcuts for the office (ignored while typing), plus the "?" cheat sheet. */
export function Shortcuts() {
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const [help, setHelp] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('[aria-label="Command palette"], .tour')) return;
      const k = e.key.toLowerCase();
      if (pendingG) {
        setPendingG(false);
        clearTimeout(gTimer);
        const go = GO_KEYS[k];
        if (go) {
          e.preventDefault();
          if (useOffice.getState().floor !== "ground") goFloor("ground");
          open({ kind: "room", room: go.room });
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (k === "g") {
        setPendingG(true);
        gTimer = setTimeout(() => setPendingG(false), 1200);
      } else if (k === "n") {
        e.preventDefault();
        if (useOffice.getState().floor !== "ground") goFloor("ground");
        open({ kind: "room", room: "meeting" });
        // Let the board mount, then put the cursor in the title.
        setTimeout(() => window.dispatchEvent(new Event(FOCUS_NEW_TASK)), 50);
      } else if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event("pixel-office:palette"));
      } else if (k === "b" && e.shiftKey) {
        goFloor(useOffice.getState().floor === "ground" ? "basement" : "ground");
      } else if (e.key === "Escape" && help) {
        setHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(gTimer);
    };
  }, [pendingG, help, open, goFloor]);

  return (
    <>
      {pendingG && <div className="key-hint">g … (b board, i inbox, r review, t today, d intake, s study, h HR, f finance, l lounge, u status)</div>}
      {help && (
        <div className="palette-backdrop" onMouseDown={() => setHelp(false)}>
          <div className="palette" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
            <div className="row">
              <h4 style={{ flex: 1, margin: 0 }}>⌨ KEYBOARD SHORTCUTS</h4>
              <button className="px-btn small" onClick={() => setHelp(false)}>Close</button>
            </div>
            <table className="usage-table keys-table">
              <tbody>
                <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd></td><td>Jump anywhere, search threads and documents</td></tr>
                <tr><td><kbd>n</kbd></td><td>New task on the board</td></tr>
                {Object.entries(GO_KEYS).map(([k, v]) => (
                  <tr key={k}><td><kbd>g</kbd> <kbd>{k}</kbd></td><td>{v.label}</td></tr>
                ))}
                <tr><td><kbd>Shift</kbd>+<kbd>B</kbd></td><td>Stairs: ground floor ⇄ B1</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close the open panel</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Post a comment or ask a question</td></tr>
                <tr><td><kbd>?</kbd></td><td>This list</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
