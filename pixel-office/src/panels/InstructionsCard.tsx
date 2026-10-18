import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Agent } from "../api/types";
import { useOfficeData } from "../state/officeData";
import { Markdown } from "../lib/markdown";

interface Snapshot {
  at: string;
  content: string;
}
type SnapshotStore = Record<string, Snapshot[]>;
const KEEP = 10;

async function loadSnapshots(): Promise<SnapshotStore> {
  const res = await fetch("/office-admin/settings/instructions-history");
  return ((await res.json().catch(() => null)) as SnapshotStore | null) ?? {};
}

/** Paperclip doesn't keep history for these files, so the office keeps the last few versions itself. */
async function snapshot(key: string, content: string) {
  const store = await loadSnapshots();
  const list = [{ at: new Date().toISOString(), content }, ...(store[key] ?? []).filter((s) => s.content !== content)].slice(0, KEEP);
  await fetch("/office-admin/settings/instructions-history", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...store, [key]: list }) });
}

/** Blocks the setup scripts manage (handbook, brain, gstack); edits inside them get overwritten. */
const MANAGED = /<!--\s*([\w-]+):begin\s*-->/g;

/** Read and edit an employee's instructions (their AGENTS.md bundle), with history and restore. */
export function InstructionsCard({ agent }: { agent: Agent }) {
  const { toast, agentById } = useOfficeData();
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [viewRev, setViewRev] = useState<string>("");

  const bundle = useQuery({ queryKey: ["instructions", agent.id], queryFn: () => api.instructionsBundle(agent.id), enabled: shown });
  const file = path ?? bundle.data?.entryFile ?? null;
  const content = useQuery({ queryKey: ["instructions-file", agent.id, file], queryFn: () => api.instructionsFile(agent.id, file!), enabled: shown && !!file });
  const history = useQuery({ queryKey: ["instructions-history", agent.id], queryFn: () => api.instructionsHistory(agent.id), enabled: shown });
  const snapKey = `${agent.id}:${file}`;
  const snaps = useQuery({ queryKey: ["instructions-snapshots"], queryFn: loadSnapshots, enabled: shown });
  const mySnaps = snaps.data?.[snapKey] ?? [];
  const isSnap = viewRev.startsWith("snap:");
  const revision = useQuery({ queryKey: ["instructions-rev", agent.id, viewRev], queryFn: () => api.instructionsRevision(agent.id, viewRev), enabled: !!viewRev && !isSnap });

  useEffect(() => {
    if (content.data && !editing) setDraft(content.data.content);
  }, [content.data, editing]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["instructions-file", agent.id] });
    qc.invalidateQueries({ queryKey: ["instructions-history", agent.id] });
    qc.invalidateQueries({ queryKey: ["instructions", agent.id] });
    qc.invalidateQueries({ queryKey: ["instructions-snapshots"] });
  };
  const save = useMutation({
    mutationFn: async (body?: string) => {
      // Keep what's there now, so this save can be undone.
      if (content.data) await snapshot(snapKey, content.data.content).catch(() => undefined);
      return api.saveInstructionsFile(agent.id, file!, body ?? draft, content.data?.contentHash ?? null);
    },
    onSuccess: () => {
      toast(`Saved ${agent.name}'s instructions. They apply from their next shift.`);
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => toast(/hash|conflict|changed/i.test(e.message) ? "Someone changed these instructions meanwhile. Reload and try again." : e.message),
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) => api.restoreInstructions(agent.id, file!, revisionId, content.data!.revision.id),
    onSuccess: () => {
      toast("Restored that version.");
      setViewRev("");
      refresh();
    },
    onError: (e: Error) => toast(e.message),
  });

  const text = content.data?.content ?? "";
  const managed = [...new Set([...text.matchAll(MANAGED)].map((m) => m[1]))];
  const revs = (history.data?.revisions ?? []).filter((r) => !file || r.entryFile === file || r.path === file);
  const snapContent = isSnap ? mySnaps[Number(viewRev.slice(5))]?.content : undefined;
  const showing = snapContent ?? (viewRev && revision.data ? revision.data.content : text);

  return (
    <div className="px-card">
      <div className="row">
        <h4 style={{ flex: 1, margin: 0 }}>📜 INSTRUCTIONS</h4>
        <button className="px-btn small" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Read"}
        </button>
      </div>
      {shown && (
        <>
          {bundle.error && <div style={{ color: "var(--bad)" }}>{(bundle.error as Error).message}</div>}
          {bundle.data && bundle.data.files.length > 1 && (
            <select className="px-select" aria-label="Instruction file" value={file ?? ""} onChange={(e) => (setPath(e.target.value), setEditing(false), setViewRev(""))}>
              {bundle.data.files.map((f) => (
                <option key={f.path} value={f.path}>{f.path}{f.isEntryFile ? " (main)" : ""}</option>
              ))}
            </select>
          )}
          {managed.length > 0 && (
            <div className="muted" style={{ fontSize: 15, margin: "4px 0" }}>
              Sections marked <code>{managed.join(", ")}</code> are kept up to date by the setup scripts; edit outside them.
            </div>
          )}
          {!editing && (
            <div className="row" style={{ margin: "4px 0" }}>
              {(revs.length > 0 || mySnaps.length > 0) && (
                <select className="px-select" style={{ flex: 1, margin: 0, fontSize: 15 }} aria-label="Version" value={viewRev} onChange={(e) => setViewRev(e.target.value)}>
                  <option value="">Current version</option>
                  {mySnaps.map((s, i) => (
                    <option key={`snap:${i}`} value={`snap:${i}`}>
                      Before the save of {new Date(s.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </option>
                  ))}
                  {revs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · {r.actorUserId ? "you" : (agentById(r.actorAgentId)?.name ?? "system")}
                    </option>
                  ))}
                </select>
              )}
              {viewRev ? (
                <button className="px-btn small" disabled={restore.isPending || !content.data} onClick={() => {
                    if (!confirm("Make this version the current instructions?")) return;
                    if (isSnap && snapContent !== undefined) save.mutate(snapContent, { onSuccess: () => setViewRev("") });
                    else restore.mutate(viewRev);
                  }}>
                  ↺ Restore
                </button>
              ) : (
                bundle.data?.editable !== false && (
                  <button className="px-btn small primary" disabled={!content.data} onClick={() => setEditing(true)}>
                    ✎ Edit
                  </button>
                )
              )}
            </div>
          )}
          {editing ? (
            <>
              <textarea className="px-textarea" aria-label={`${agent.name}'s instructions`} style={{ minHeight: 320, fontSize: 15, fontFamily: "ui-monospace, monospace" }} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row">
                <button className="px-btn small primary" disabled={save.isPending || draft === text} onClick={() => save.mutate(undefined)}>
                  {save.isPending ? "Saving…" : "Save"}
                </button>
                <button className="px-btn small" onClick={() => (setEditing(false), setDraft(text))}>Cancel</button>
                <span className="muted" style={{ fontSize: 15 }}>{draft.length.toLocaleString()} characters</span>
              </div>
            </>
          ) : (
            <div className="doc-view">{content.isLoading ? <span className="muted">Opening the file…</span> : <Markdown text={showing} />}</div>
          )}
        </>
      )}
    </div>
  );
}
