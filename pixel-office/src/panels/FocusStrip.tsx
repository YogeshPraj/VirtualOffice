import type { Issue } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";
import { MAX_FOCUS, useFocus } from "../lib/focus";
import { NOTE_COLORS } from "./MeetingPanel";

/** The pinned priorities, shown at the top of the board and in the Today report. */
export function FocusStrip({ compact = false }: { compact?: boolean }) {
  const { issues, agentById } = useOfficeData();
  const open = useOffice((s) => s.open);
  const { ids, toggle } = useFocus();
  const pinned = ids.map((id) => issues.find((i) => i.id === id)).filter((i): i is Issue => !!i);
  if (!pinned.length) {
    return compact ? null : (
      <div className="muted" style={{ fontSize: 15, margin: "0 0 6px" }}>
        🎯 Pin up to {MAX_FOCUS} tasks as your priorities with ☆ Focus on a task.
      </div>
    );
  }
  const done = pinned.filter((i) => i.status === "done").length;
  return (
    <div className="px-card focus-strip" style={{ borderLeft: "8px solid var(--accent)" }}>
      <h4>
        🎯 FOCUS <span className="muted">{done}/{pinned.length} done</span>
      </h4>
      <div className="focus-notes">
        {pinned.map((i) => (
          <div key={i.id} className="focus-note" style={{ background: NOTE_COLORS[i.status] }}>
            <button className="link-btn" style={{ flex: 1 }} onClick={() => open({ kind: "issue", issueId: i.id })} title={i.title}>
              {i.status === "done" ? "✔ " : ""}
              <b>{i.identifier}</b> {i.title}
              <small className="muted" style={{ display: "block", fontSize: 13 }}>
                {i.status.replace("_", " ")} · {agentById(i.assigneeAgentId)?.name ?? "unassigned"}
              </small>
            </button>
            {!compact && (
              <button className="chip-x" aria-label={`Unpin ${i.identifier}`} title="Unpin" onClick={() => toggle(i.id)}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
