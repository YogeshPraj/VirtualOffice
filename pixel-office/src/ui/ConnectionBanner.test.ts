import { describe, expect, it } from "vitest";
import { connectionMessage } from "./ConnectionBanner";

const svc = { failures: 2, restarts: [] as number[], wasDown: true, gaveUp: false };

describe("connection banner", () => {
  it("says nothing while Paperclip answers", () => {
    expect(connectionMessage(true, null)).toBeNull();
  });
  it("explains what the watchdog is doing", () => {
    const now = Date.parse("2026-10-19T10:00:00");
    expect(connectionMessage(false, svc, now)).toMatch(/restarts it if/);
    expect(connectionMessage(false, { ...svc, restarts: [now - 60_000] }, now)).toMatch(/restarted it at/);
    expect(connectionMessage(false, { ...svc, restarts: [now - 3_600_000] }, now)).toMatch(/restarts it if/);
    expect(connectionMessage(false, { ...svc, gaveUp: true }, now)).toMatch(/desktop icon/);
    expect(connectionMessage(false, "unreachable", now)).toMatch(/office server/);
  });
});
