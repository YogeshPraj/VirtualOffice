import { describe, expect, it } from "vitest";
import { findLeaks, mask } from "./leak-watch";

// Fake secrets built at runtime, so this file never holds a real-looking token itself.
const gh = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const aws = "AKIA" + "ABCDEFGHIJKLMNOP";

describe("leak watch", () => {
  it("finds real-looking secrets", () => {
    expect(findLeaks(`use ${gh} for the API`).map((f) => f.label)).toEqual(["GitHub token"]);
    expect(findLeaks(`key ${aws}`).map((f) => f.label)).toEqual(["AWS access key"]);
    expect(findLeaks("Server=db;User Id=sa;Password=Hunter2xyz;").map((f) => f.label)).toEqual(["Password in a connection string"]);
    expect(findLeaks("-----BEGIN OPENSSH PRIVATE KEY-----\nabc").map((f) => f.label)).toEqual(["Private key"]);
  });
  it("ignores redactions, placeholders and ordinary text", () => {
    expect(findLeaks('Authorization = "***REDACTED***"')).toEqual([]);
    expect(findLeaks("token=<your token here>")).toEqual([]);
    expect(findLeaks("password=${DB_PASSWORD}")).toEqual([]);
    expect(findLeaks("The password reset flow takes a token from the email.")).toEqual([]);
  });
  it("never shows the secret", () => {
    const m = mask(gh);
    expect(m).not.toContain(gh.slice(6));
    expect(m).toMatch(/…\(40 chars\)$/);
  });
});
