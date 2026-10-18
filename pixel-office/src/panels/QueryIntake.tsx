import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useOfficeData } from "../state/officeData";

interface QueryHit {
  url: string;
  key: string;
  title: string;
  type?: string;
  state?: string;
  assignee?: string;
}

const PROJECT_KEY = "pixel-office:ado-project";
const MAX_PICK = 50; // the desk looks up at most 50 links at a time

function loadProject(): string {
  try {
    return localStorage.getItem(PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Bring in many items at once: a saved ADO query, WIQL, "my open items", or a GitHub issue search. */
export function QueryIntake({ onAdd, existing }: { onAdd: (urls: string[]) => void; existing: (url: string) => string | undefined }) {
  const { toast } = useOfficeData();
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState(loadProject);
  const [mine, setMine] = useState(false);
  const [hits, setHits] = useState<QueryHit[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<{ total: number; truncated: boolean } | null>(null);

  const isWiql = /^\s*select\b/i.test(query);
  const needsProject = mine || isWiql;

  const run = useMutation({
    mutationFn: async () => {
      if (needsProject) {
        try {
          localStorage.setItem(PROJECT_KEY, project.trim());
        } catch {
          /* fine */
        }
      }
      const res = await fetch("/office-admin/intake/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mine ? "" : query, project, mine }),
      });
      const data = (await res.json().catch(() => ({}))) as { hits?: QueryHit[]; total?: number; truncated?: boolean; error?: string; fix?: string };
      if (!res.ok) throw new Error(`${data.error ?? "The query failed"}${data.fix ? ` Fix: ${data.fix}` : ""}`);
      return data;
    },
    onSuccess: (d) => {
      const list = d.hits ?? [];
      setHits(list);
      setMeta({ total: d.total ?? list.length, truncated: !!d.truncated });
      // Pre-tick what isn't already a task, up to what the desk can look up at once.
      setPicked(new Set(list.filter((h) => !existing(h.url)).slice(0, MAX_PICK).map((h) => h.url)));
      if (!list.length) toast("The query ran but matched nothing.");
    },
  });

  const toggle = (url: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(url)) n.delete(url);
      else if (n.size < MAX_PICK) n.add(url);
      else toast(`Pick at most ${MAX_PICK} at a time.`);
      return n;
    });

  if (!shown) {
    return (
      <button className="px-btn small" onClick={() => setShown(true)} style={{ marginBottom: 8 }}>
        📋 Bring in a whole query or search…
      </button>
    );
  }

  return (
    <div className="px-card" style={{ borderLeft: "8px solid var(--info)" }}>
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>📋 FROM A QUERY OR SEARCH</h4>
        <button className="px-btn small" onClick={() => setShown(false)}>Hide</button>
      </div>
      <div className="muted" style={{ fontSize: 16, margin: "4px 0" }}>
        A saved Azure DevOps query link, WIQL (<code>SELECT … FROM workitems …</code>), or a GitHub issues/PR search URL (e.g.{" "}
        <code>github.com/org/repo/issues?q=label:bug</code>).
      </div>
      <label style={{ display: "block", cursor: "pointer", margin: "4px 0" }}>
        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My open ADO items (assigned to me, not closed)
      </label>
      {!mine && (
        <textarea
          className="px-textarea"
          aria-label="Query link, WIQL or search URL"
          style={{ minHeight: 60, fontSize: 16 }}
          placeholder={"https://dev.azure.com/org/project/_queries/query/<id>/\nor SELECT [System.Id] FROM workitems WHERE …\nor https://github.com/org/repo/issues?q=is:open+label:bug"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {needsProject && (
        <input
          className="px-input"
          aria-label="Azure DevOps project link"
          placeholder="ADO project link, e.g. https://dev.azure.com/org/project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        />
      )}
      <button className="px-btn small primary" disabled={run.isPending || (!mine && !query.trim()) || (needsProject && !project.trim())} onClick={() => run.mutate()}>
        {run.isPending ? "Running…" : "▶ Run"}
      </button>
      {run.error && <div style={{ color: "var(--bad)", marginTop: 6 }}>{(run.error as Error).message}</div>}

      {hits && hits.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <b style={{ flex: 1 }}>
              {hits.length} match{hits.length === 1 ? "" : "es"}
              {meta?.truncated ? ` (showing the first ${hits.length} of ${meta.total})` : ""}
            </b>
            <button className="px-btn small" onClick={() => setPicked(new Set(hits.filter((h) => !existing(h.url)).slice(0, MAX_PICK).map((h) => h.url)))}>
              All new
            </button>
            <button className="px-btn small" onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
          <div className="query-hits">
            {hits.map((h) => {
              const dup = existing(h.url);
              return (
                <label key={h.url} className="row" style={{ alignItems: "flex-start", margin: "3px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={picked.has(h.url)} onChange={() => toggle(h.url)} />
                  <span style={{ flex: 1, fontSize: 17 }}>
                    <b>{h.key}</b> {h.title}
                    <small className="muted" style={{ display: "block", fontSize: 15 }}>
                      {[h.type, h.state, h.assignee && `@${h.assignee}`].filter(Boolean).join(" · ")}
                      {dup ? ` · already ${dup}` : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            className="px-btn primary small"
            disabled={picked.size === 0}
            onClick={() => {
              onAdd(hits.filter((h) => picked.has(h.url)).map((h) => h.url));
              setHits(null);
              setShown(false);
            }}
          >
            ➕ Put {picked.size} on the desk
          </button>
        </>
      )}
    </div>
  );
}
