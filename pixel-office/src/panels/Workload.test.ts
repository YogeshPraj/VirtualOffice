import { describe, expect, it } from "vitest";
import { suggestion, workload } from "./Workload";

const now = Date.parse("2026-10-18T12:00:00Z");
const ag = (id: string, role: string, status = "idle") => ({ id, name: id, role, status, lastHeartbeatAt: "2026-10-18T10:00:00Z" }) as never;
const task = (id: string, who: string, status: string, priority = "medium") => ({ id, identifier: id, title: id, assigneeAgentId: who, status, priority, createdAt: "2026-10-18T00:00:00Z" }) as never;

describe("workload", () => {
  const agents = [ag("busy", "engineer"), ag("free", "engineer"), ag("qa", "qa", "paused")];
  const issues = [task("T1", "busy", "in_progress"), task("T2", "busy", "todo", "high"), task("T3", "busy", "todo", "low"), task("Q", "free", "done")];
  it("orders busiest first and measures idle time", () => {
    const l = workload(agents, issues, now);
    expect(l[0].agent.id).toBe("busy");
    expect(l[0].queue.map((i) => i.id)).toEqual(["T2", "T3"]);
    expect(l.find((x) => x.agent.id === "free")!.idleMs).toBe(2 * 3_600_000);
  });
  it("suggests moving the lowest-priority queued task to an idle peer", () => {
    const s = suggestion(workload(agents, issues, now))!;
    expect([s.task.id, s.from.id, s.to.id]).toEqual(["T3", "busy", "free"]);
  });
});
