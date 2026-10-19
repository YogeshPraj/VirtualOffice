import { describe, expect, it } from "vitest";
import { cronFor, describeCron } from "../lib/schedules";
import { routineFromTask } from "./RepeatTask";

describe("recurring tasks", () => {
  it("picks the cron for a schedule, checking custom ones", () => {
    expect(cronFor("weekly")).toBe("0 9 * * 1");
    expect(cronFor("monthly")).toBe("0 9 1 * *");
    expect(cronFor("custom", "30 8 * * 2")).toBe("30 8 * * 2");
    expect(cronFor("custom", "every tuesday")).toBeNull();
    expect(cronFor("none")).toBeNull();
    expect(describeCron("0 9 1 * *")).toBe("1st of the month at 9:00");
  });
  it("makes a routine from the task", () => {
    expect(routineFromTask({ title: "Copy of Dependency updates", description: "Run npm outdated", assigneeAgentId: "a" })).toEqual({
      title: "Dependency updates",
      description: "Run npm outdated",
      assigneeAgentId: "a",
      status: "active",
    });
  });
});
