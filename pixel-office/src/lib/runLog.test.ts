import { describe, expect, it } from "vitest";
import { RunLogParser } from "./runLog";

const ts = "2026-10-18T17:52:57.000Z";
const j = (o: unknown) => `${JSON.stringify(o)}\n`;

describe("RunLogParser", () => {
  it("reads Copilot events and drops the noise", () => {
    const p = new RunLogParser();
    const lines = p.push({
      ts,
      stream: "stdout",
      seq: 1,
      chunk:
        j({ type: "session.mcp_server_status_changed", data: {} }) +
        j({ type: "assistant.message", data: { content: "Checking the repo", toolRequests: [{ name: "view", arguments: { path: "README.md" } }] } }) +
        j({ type: "tool.execution_complete", data: { success: false, result: { content: "not found" } } }),
    });
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ["say", "Checking the repo"],
      ["tool", "view README.md"],
      ["err", "not found"],
    ]);
  });

  it("joins JSON lines split across chunks and skips repeated seqs", () => {
    const p = new RunLogParser();
    const line = j({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] } });
    expect(p.push({ ts, stream: "stdout", seq: 1, chunk: line.slice(0, 20) })).toEqual([]);
    expect(p.push({ ts, stream: "stdout", seq: 2, chunk: line.slice(20) })[0]).toMatchObject({ kind: "tool", text: "Bash npm test" });
    expect(p.push({ ts, stream: "stdout", seq: 2, chunk: line })).toEqual([]);
  });

  it("parses a stored log and marks the end of the shift", () => {
    const stored = [
      { ts, stream: "stderr", seq: 1, chunk: "warning: slow disk\n" },
      { ts, stream: "stdout", seq: 2, chunk: j({ type: "result", exitCode: 0 }) },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n");
    expect(new RunLogParser().pushStored(stored).map((l) => l.kind)).toEqual(["err", "done"]);
  });
});
