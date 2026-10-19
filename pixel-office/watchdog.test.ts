import { describe, expect, it } from "vitest";
import { decide, POLICY } from "./watchdog";

const fresh = () => ({ failures: 0, restarts: [] as number[], wasDown: false, gaveUp: false });
const now = 10_000_000;

describe("watchdog", () => {
  it("waits for a second failed check before restarting", () => {
    expect(decide(fresh(), false, now)).toBe("none");
    expect(decide({ ...fresh(), failures: 1 }, false, now)).toBe("restart");
  });
  it("cools down between restarts and gives up after too many in an hour", () => {
    expect(decide({ ...fresh(), failures: 1, restarts: [now - 60_000] }, false, now)).toBe("none");
    expect(decide({ ...fresh(), failures: 1, restarts: [now - POLICY.cooldownMs - 1] }, false, now)).toBe("restart");
    const many = Array.from({ length: POLICY.maxPerHour }, (_, i) => now - (i + 1) * 600_000);
    expect(decide({ ...fresh(), failures: 1, restarts: many }, false, now)).toBe("give-up");
  });
  it("notes a recovery once it's back", () => {
    expect(decide({ ...fresh(), wasDown: true }, true, now)).toBe("recovered");
    expect(decide(fresh(), true, now)).toBe("none");
  });
});

import { encodeCommand } from "./watchdog";

describe("watchdog launch", () => {
  it("encodes the PowerShell command as base64 UTF-16LE", () => {
    expect(Buffer.from(encodeCommand("& 'C:\it''s\start.ps1'"), "base64").toString("utf16le")).toBe("& 'C:\it''s\start.ps1'");
  });
});
