import { useRef, useState } from "react";
import { brainApi, type ImportResult } from "../api/brain";

const NOTE = /\.(md|markdown|txt)$/i;
const SKIP_DIRS = /(^|\/)(\.git|node_modules|\.obsidian|\.trash|\.vscode)(\/|$)/;
// Keep each request well under the server's comfort zone; the brain caps a batch at 8 MB.
const REQUEST_BYTES = 3 * 1024 * 1024;
const REQUEST_FILES = 50;

interface Picked {
  folder: string;
  files: File[];
  ignored: number;
}

/** Pick a folder of Markdown/text notes (an Obsidian vault, a docs folder) and file them in the brain. */
export function BrainImport() {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = (list: FileList | null) => {
    setResult(null);
    setError(null);
    if (!list?.length) return;
    const all = Array.from(list);
    const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const folder = rel(all[0]).split("/")[0] || "notes";
    const files = all.filter((f) => NOTE.test(f.name) && !SKIP_DIRS.test(rel(f)));
    setPicked({ folder, files, ignored: all.length - files.length });
  };

  const run = async () => {
    if (!picked) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    const total: ImportResult = { written: 0, slugs: [], skipped: [], failed: [] };
    try {
      let batch: { path: string; content: string }[] = [];
      let bytes = 0;
      const flush = async () => {
        if (!batch.length) return;
        const r = await brainApi.importNotes(picked.folder, batch);
        total.written += r.written;
        total.slugs.push(...r.slugs);
        total.skipped.push(...r.skipped);
        total.failed.push(...r.failed);
        batch = [];
        bytes = 0;
      };
      for (let i = 0; i < picked.files.length; i++) {
        const f = picked.files[i];
        const path = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
        if (f.size > 512 * 1024) {
          total.skipped.push({ path, reason: "over 512 KB" });
          continue;
        }
        if (bytes + f.size > REQUEST_BYTES || batch.length >= REQUEST_FILES) await flush();
        batch.push({ path, content: await f.text() });
        bytes += f.size;
        setProgress(Math.round(((i + 1) / picked.files.length) * 100));
      }
      await flush();
      setResult(total);
    } catch (e) {
      setError((e as Error).message);
      if (total.written) setResult(total);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-card">
      <h4>📥 IMPORT NOTES INTO THE BRAIN</h4>
      <div style={{ fontSize: 17 }}>
        Pick a folder of <code>.md</code> or <code>.txt</code> notes (an Obsidian vault, a wiki export, a docs folder). Each note becomes a brain page under{" "}
        <code>imports/&lt;folder&gt;/</code> that every employee can search. Re-importing the same folder updates those pages.
      </div>
      <div className="muted" style={{ fontSize: 16, margin: "4px 0" }}>
        Notes that look like they contain a secret are skipped. Keep secrets in the B1 Vault.
      </div>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        // Folder picking: non-standard but supported by Edge/Chrome.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="row">
        <button className="px-btn small" disabled={busy} onClick={() => input.current?.click()}>
          📂 Choose a folder…
        </button>
        {picked && (
          <span style={{ flex: 1 }}>
            <b>{picked.folder}</b>: {picked.files.length} note{picked.files.length === 1 ? "" : "s"}
            {picked.ignored ? <span className="muted"> ({picked.ignored} other files ignored)</span> : null}
          </span>
        )}
      </div>
      {picked && picked.files.length > 300 && <div style={{ color: "var(--bad)" }}>That's a lot of notes; the import runs in batches and may take a few minutes.</div>}
      {picked && picked.files.length > 0 && (
        <button className="px-btn primary small" disabled={busy} onClick={run}>
          {busy ? `Importing… ${progress}%` : `Import ${picked.files.length} note${picked.files.length === 1 ? "" : "s"}`}
        </button>
      )}
      {busy && (
        <div className="meter">
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <div style={{ color: "var(--bad)", marginTop: 6 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "var(--good)" }}>✔ {result.written} page{result.written === 1 ? "" : "s"} written to the brain.</div>
          {result.skipped.length > 0 && (
            <details>
              <summary>{result.skipped.length} skipped</summary>
              {result.skipped.map((s, i) => (
                <small key={i} style={{ display: "block" }}>
                  {s.path}: {s.reason}
                </small>
              ))}
            </details>
          )}
          {result.failed.length > 0 && (
            <details open>
              <summary style={{ color: "var(--bad)" }}>{result.failed.length} failed</summary>
              {result.failed.map((s, i) => (
                <small key={i} style={{ display: "block" }}>
                  {s.path}: {s.reason}
                </small>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
