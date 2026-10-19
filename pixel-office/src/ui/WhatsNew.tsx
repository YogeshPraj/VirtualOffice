import { useEffect, useState } from "react";

const SEEN = "pixel-office:seen-version";

interface Change {
  hash: string;
  subject: string;
}

/** After the office is updated (however it was updated), list what's new, once. */
export function WhatsNew() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [head, setHead] = useState("");

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
    } catch {
      return;
    }
    fetch(`/office-admin/update/changes?since=${encodeURIComponent(seen ?? "")}`)
      .then((r) => r.json() as Promise<{ head: string; commits: Change[] }>)
      .then((d) => {
        setHead(d.head);
        // First run on this machine: remember the version quietly.
        if (!seen) localStorage.setItem(SEEN, d.head);
        else if (d.head !== seen && d.commits.length) setChanges(d.commits);
        else if (d.head !== seen) localStorage.setItem(SEEN, d.head);
      })
      .catch(() => undefined);
  }, []);

  if (!changes) return null;
  const close = () => {
    try {
      localStorage.setItem(SEEN, head);
    } catch {
      /* fine */
    }
    setChanges(null);
  };
  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label="What's new in the office" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row">
          <h4 style={{ flex: 1, margin: 0 }}>🆕 WHAT'S NEW IN THE OFFICE</h4>
          <button className="px-btn small" onClick={close} autoFocus>
            Got it
          </button>
        </div>
        <ul className="whats-new">
          {changes.map((c) => {
            const [title, rest] = c.subject.split(/:\s(.+)/);
            return (
              <li key={c.hash}>
                {rest ? (
                  <>
                    <b>{title}</b>: {rest}
                  </>
                ) : (
                  c.subject
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
