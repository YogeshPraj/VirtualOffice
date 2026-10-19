import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isTailscale, resetLockout, startGateway, tailscaleAddress, tokenMatches } from "./phone-gateway";

const TOKEN = "test-token-123";
const HASH = createHash("sha256").update(TOKEN).digest("hex");

describe("phone view: where it listens", () => {
  it("only recognises Tailscale addresses", () => {
    expect(isTailscale("100.101.7.3")).toBe(true);
    expect(isTailscale("100.63.0.1")).toBe(false);
    expect(isTailscale("192.168.0.181")).toBe(false);
    expect(isTailscale("10.0.0.5")).toBe(false);
    expect(tailscaleAddress({ eth: [{ address: "192.168.0.2", family: "IPv4", internal: false, netmask: "", mac: "", cidr: null }] })).toBeNull();
    expect(tailscaleAddress({ ts: [{ address: "100.80.1.2", family: "IPv4", internal: false, netmask: "", mac: "", cidr: null }] })).toBe("100.80.1.2");
  });
  it("checks tokens against the stored hash", () => {
    expect(tokenMatches(TOKEN, HASH)).toBe(true);
    expect(tokenMatches("wrong", HASH)).toBe(false);
    expect(tokenMatches(TOKEN, null)).toBe(false);
    expect(tokenMatches(null, HASH)).toBe(false);
  });
});

describe("phone view: the gateway", () => {
  let server: Server;
  let base: string;
  const calls: string[] = [];
  beforeAll(async () => {
    server = await startGateway("127.0.0.1", 0, {
      tokenHash: () => HASH,
      handle: async (method, path) => {
        calls.push(`${method} ${path}`);
        return { status: 200, body: { ok: true } };
      },
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(() => r(null))));
  beforeEach(() => resetLockout());

  it("serves the page with a strict content policy", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toMatch(/script-src 'self'/);
    expect(await r.text()).toMatch(/<script src="\/app.js">/);
  });
  it("refuses the API without the right token", async () => {
    expect((await fetch(`${base}/m/home`)).status).toBe(401);
    expect((await fetch(`${base}/m/home`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    expect(calls).toEqual([]);
    const ok = await fetch(`${base}/m/home`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(ok.status).toBe(200);
    expect(calls).toEqual(["GET /m/home"]);
  });
  it("locks out after too many wrong tokens, even for the right one", async () => {
    for (let i = 0; i < 10; i++) await fetch(`${base}/m/home`, { headers: { authorization: "Bearer nope" } });
    expect((await fetch(`${base}/m/home`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(429);
  });
  it("has nothing else to serve", async () => {
    expect((await fetch(`${base}/api/companies`)).status).toBe(404);
  });
});
