// Turn an employee's raw run output (Copilot or Claude Code JSON event streams) into
// a short, human transcript for the over-the-shoulder view.

export type LineKind = "say" | "think" | "tool" | "out" | "err" | "done";

export interface RunLine {
  ts: string;
  kind: LineKind;
  text: string;
}

const MAX_TEXT = 600;

function clip(text: string, max = MAX_TEXT): string {
  const t = text.replace(/\r/g, "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** One-line summary of a tool call's arguments: the path, command or query that matters. */
function argSummary(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  for (const k of ["command", "path", "file_path", "pattern", "query", "url", "description"]) {
    if (typeof a[k] === "string") return clip(a[k] as string, 160);
  }
  const first = Object.values(a).find((v) => typeof v === "string");
  return typeof first === "string" ? clip(first, 160) : "";
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c?.text ?? ""))).join("\n");
  if (content && typeof content === "object" && "content" in content) return resultText((content as { content: unknown }).content);
  return "";
}

/** Map one adapter JSON event to transcript lines (most events are noise and map to none). */
export function eventToLines(ev: Record<string, unknown>, ts: string): RunLine[] {
  const type = String(ev.type ?? "");
  const data = (ev.data ?? {}) as Record<string, unknown>;
  const out: RunLine[] = [];
  const push = (kind: LineKind, text: string) => text.trim() && out.push({ ts, kind, text: clip(text) });

  // Copilot CLI (--output-format json)
  if (type === "assistant.message") {
    push("say", String(data.content ?? ""));
    for (const t of (data.toolRequests as { name?: string; arguments?: unknown }[] | undefined) ?? []) {
      push("tool", `${t.name ?? "tool"} ${argSummary(t.arguments)}`);
    }
  } else if (type === "assistant.reasoning") {
    push("think", String(data.content ?? ""));
  } else if (type === "tool.execution_complete") {
    const ok = data.success !== false;
    const text = resultText(data.result);
    if (!ok) push("err", text || "Tool failed");
    else if (text) push("out", clip(text, 240));
  }
  // Claude Code (--output-format stream-json)
  else if (type === "assistant" && ev.message && typeof ev.message === "object") {
    for (const c of ((ev.message as { content?: unknown[] }).content ?? []) as Record<string, unknown>[]) {
      if (c.type === "text") push("say", String(c.text ?? ""));
      else if (c.type === "thinking") push("think", String(c.thinking ?? ""));
      else if (c.type === "tool_use") push("tool", `${c.name ?? "tool"} ${argSummary(c.input)}`);
    }
  } else if (type === "user" && ev.message && typeof ev.message === "object") {
    for (const c of ((ev.message as { content?: unknown[] }).content ?? []) as Record<string, unknown>[]) {
      if (c.type !== "tool_result") continue;
      const text = resultText(c.content);
      if (c.is_error) push("err", text || "Tool failed");
      else if (text) push("out", clip(text, 240));
    }
  }
  // Both: the end of the run
  else if (type === "result") {
    const failed = ev.is_error === true || (typeof ev.exitCode === "number" && ev.exitCode !== 0);
    push(failed ? "err" : "done", typeof ev.result === "string" && ev.result ? ev.result : failed ? "Run ended with an error." : "Finished this shift.");
  }
  return out;
}

/**
 * Accumulates raw chunks (which can split JSON lines anywhere) and emits transcript lines.
 * Non-JSON stderr is shown as errors; non-JSON stdout is shown as plain output.
 */
export class RunLogParser {
  private buf: Record<string, string> = {};
  private seen = new Set<number>();

  push(chunk: { stream: string; chunk: string; ts: string; seq?: number }): RunLine[] {
    if (typeof chunk.seq === "number") {
      if (this.seen.has(chunk.seq)) return [];
      this.seen.add(chunk.seq);
    }
    const key = chunk.stream;
    const text = (this.buf[key] ?? "") + chunk.chunk;
    const parts = text.split("\n");
    this.buf[key] = parts.pop() ?? "";
    const lines: RunLine[] = [];
    for (const raw of parts) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith("{")) {
        try {
          lines.push(...eventToLines(JSON.parse(l), chunk.ts));
          continue;
        } catch {
          /* not JSON after all */
        }
      }
      if (key === "stderr") lines.push({ ts: chunk.ts, kind: "err", text: clip(l) });
      else if (key === "stdout") lines.push({ ts: chunk.ts, kind: "out", text: clip(l, 240) });
    }
    return lines;
  }

  /** Parse a whole stored log (ndjson of {ts, stream, chunk, seq}). */
  pushStored(ndjson: string): RunLine[] {
    const lines: RunLine[] = [];
    for (const row of ndjson.split("\n")) {
      if (!row.trim()) continue;
      try {
        lines.push(...this.push(JSON.parse(row)));
      } catch {
        /* skip a torn final row */
      }
    }
    return lines;
  }
}
