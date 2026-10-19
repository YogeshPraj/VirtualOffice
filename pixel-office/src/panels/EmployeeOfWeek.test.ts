import { describe, expect, it } from "vitest";
import type { Agent, Issue } from "../api/types";
import { employeeOfWeek } from "./EmployeeOfWeek";

const now = Date.parse("2026-10-19T12:00:00Z");
const day = 86_400_000;
const done = (n: number, who: string, daysAgo: number, status: Issue["status"] = "done") => ({
  id: `i${n}`,
  identifier: `YOG-${n}`,
  title: `Task ${n}`,
  status,
  assigneeAgentId: who,
  completedAt: new Date(now - daysAgo * day).toISOString(),
  updatedAt: new Date(now - daysAgo * day).toISOString(),
});
const agents: Pick<Agent, "id" | "status">[] = [
  { id: "a", status: "idle" },
  { id: "b", status: "idle" },
  { id: "gone", status: "terminated" },
];

describe("employee of the week", () => {
  it("honours whoever finished the most in the last 7 days", () => {
    const issues = [done(1, "a", 1), done(2, "b", 2), done(3, "b", 3), done(4, "a", 9), done(5, "a", 10), done(6, "a", 1, "in_progress"), done(7, "gone", 1), done(8, "gone", 1), done(9, "gone", 1)];
    expect(employeeOfWeek(issues, agents, now)).toMatchObject({ agentId: "b", count: 2 });
  });
  it("breaks ties by the most recent finish, and is empty with nothing done", () => {
    expect(employeeOfWeek([done(1, "a", 3), done(2, "b", 1)], agents, now)?.agentId).toBe("b");
    expect(employeeOfWeek([done(1, "a", 8)], agents, now)).toBeNull();
  });
});
