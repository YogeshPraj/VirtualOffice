import { describe, expect, it } from "vitest";
import { machineName, machineOf } from "./machine-sync";
import { machineWarning } from "./src/lib/machine";

describe("two-machine safety", () => {
  it("signs backups with a machine name", () => {
    expect(machineName({ VIRTUAL_OFFICE_MACHINE: " Laptop " })).toBe("Laptop");
    expect(machineName({}).length).toBeGreaterThan(0);
    expect(machineOf("Backup from the pixel office\n\nOffice-Machine: LAPTOP\n")).toBe("LAPTOP");
    expect(machineOf("Some other commit")).toBeNull();
  });
  it("warns only when this copy is behind", () => {
    const at = "2026-10-19T10:00:00Z";
    expect(machineWarning({ machine: "PC", behind: 0, ahead: 0, lastRemote: null })).toBeNull();
    expect(machineWarning({ machine: "PC", behind: 2, ahead: 0, lastRemote: { machine: "LAPTOP", at, subject: "Backup" } })).toMatch(/^LAPTOP backed up the company/);
    expect(machineWarning({ machine: "PC", behind: 1, ahead: 0, lastRemote: { machine: "PC", at, subject: "x" } })).toMatch(/1 newer commit than/);
    expect(machineWarning({ machine: "PC", behind: 1, ahead: 2, lastRemote: null })).toMatch(/separately/);
  });
});
