import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHireConfig,
  buildSwitchConfig,
  dominantProvider,
  isLimitReason,
  isProvider,
  providerLabel,
  rememberTemplates,
} from "./providers";
import type { AdapterInfo, Agent } from "./types";

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: "agent-1",
  companyId: "company-1",
  name: "Agent One",
  role: "engineer",
  title: null,
  status: "active",
  reportsTo: null,
  capabilities: null,
  adapterType: "openai",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  errorReason: null,
  lastHeartbeatAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeProvider = (overrides: Partial<AdapterInfo> = {}): AdapterInfo => ({
  type: "openai",
  label: "OpenAI",
  source: "builtin",
  modelsCount: 2,
  loaded: true,
  disabled: false,
  capabilities: {},
  ...overrides,
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const templateStorageKey = "pixel-office.provider-templates";

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isProvider", () => {
  it("accepts providers that are loaded, enabled, and offer models", () => {
    expect(isProvider(makeProvider())).toBe(true);
  });

  it.each([
    { loaded: false, disabled: false, modelsCount: 2 },
    { loaded: true, disabled: true, modelsCount: 2 },
    { loaded: true, disabled: false, modelsCount: 0 },
  ])("rejects providers that are unavailable: %o", (provider) => {
    expect(isProvider(makeProvider(provider))).toBe(false);
  });
});

describe("providerLabel", () => {
  it("uses a distinct display label supplied by the adapter", () => {
    expect(providerLabel(makeProvider({ label: "OpenAI Compatible" }))).toBe("OpenAI Compatible");
  });

  it.each([
    ["openai_local", "Openai"],
    ["anthropic_compatible", "Anthropic Compatible"],
    ["custom", "Custom"],
  ])("formats the provider type %s when it has no distinct label", (type, expected) => {
    expect(providerLabel({ type, label: type })).toBe(expected);
  });
});

describe("dominantProvider", () => {
  it("chooses the provider used by the most non-terminated agents", () => {
    const agents = [
      makeAgent({ adapterType: "anthropic" }),
      makeAgent({ id: "agent-2", adapterType: "anthropic", status: "paused" }),
      makeAgent({ id: "agent-3", adapterType: "openai", status: "idle" }),
      makeAgent({ id: "agent-4", adapterType: "anthropic", status: "terminated" }),
    ];

    expect(dominantProvider([makeProvider(), makeProvider({ type: "anthropic" })], agents)).toBe("anthropic");
  });

  it("returns the first provider when there are no agents", () => {
    expect(dominantProvider([makeProvider(), makeProvider({ type: "anthropic" })], [])).toBe("openai");
  });

  it("returns an empty type when no providers are available", () => {
    expect(dominantProvider([], [makeAgent()])).toBe("");
  });
});

describe("isLimitReason", () => {
  it.each([
    "Monthly quota exceeded",
    "Rate-limit reached",
    "Usage limit reached",
    "Limit hit",
    "Out of credits",
    "Credits exhausted",
    "Premium requests are used up",
  ])("recognizes limit wording: %s", (reason) => {
    expect(isLimitReason(reason)).toBe(true);
  });

  it.each([null, undefined, "", "Provider connection timed out"])("rejects non-limit reasons: %s", (reason) => {
    expect(isLimitReason(reason)).toBe(false);
  });
});

describe("buildHireConfig", () => {
  it("copies a live provider setup, excludes employee-specific keys, and applies the requested model", () => {
    const connection = { provider: "openai", accountId: "account-1" };
    const agent = makeAgent({
      adapterConfig: {
        endpoint: "https://api.example.test",
        temperature: 0.4,
        model: "old-model",
        cwd: "/private/workspace",
        instructionsFilePath: "AGENTS.md",
      },
      runtimeConfig: { aiConnection: connection },
    });

    expect(buildHireConfig("openai", [agent], [{ key: "ignored", default: "schema-value" }], "new-model")).toEqual({
      adapterConfig: {
        endpoint: "https://api.example.test",
        temperature: 0.4,
        model: "new-model",
      },
      aiConnection: connection,
    });
  });

  it("uses eligible schema defaults when no live or remembered config exists", () => {
    const schema = [
      { key: "endpoint", default: "https://default.example.test" },
      { key: "empty", default: "" },
      { key: "unset" },
      { key: "cwd", default: "/must/not/copy" },
      { key: "model", default: "schema-model" },
    ];

    expect(buildHireConfig("openai", [], schema, "requested-model")).toEqual({
      adapterConfig: {
        endpoint: "https://default.example.test",
        model: "requested-model",
      },
      aiConnection: undefined,
    });
  });

  it("ignores terminated agents when selecting a live setup", () => {
    const terminatedAgent = makeAgent({
      status: "terminated",
      adapterConfig: { endpoint: "https://terminated.example.test" },
    });

    expect(buildHireConfig("openai", [terminatedAgent], undefined, "")).toEqual({
      adapterConfig: {},
      aiConnection: undefined,
    });
  });

  it("restores a remembered provider template ahead of schema defaults", () => {
    const connection = { provider: "openai", accountId: "remembered-account" };
    rememberTemplates([
      makeAgent({
        adapterConfig: { endpoint: "https://remembered.example.test", model: "agent-model", cwd: "/agent/path" },
        runtimeConfig: { aiConnection: connection },
      }),
    ]);

    expect(buildHireConfig("openai", [], [{ key: "endpoint", default: "schema-value" }], "new-model")).toEqual({
      adapterConfig: {
        endpoint: "https://remembered.example.test",
        model: "new-model",
      },
      aiConnection: connection,
    });
  });
});

describe("buildSwitchConfig", () => {
  it("uses the destination provider template and preserves only the current agent's settings", () => {
    const destinationConnection = { provider: "anthropic", accountId: "destination-account" };
    const current = makeAgent({
      id: "moving-agent",
      adapterType: "openai",
      adapterConfig: {
        model: "old-model",
        instructionsFilePath: "TEAM.md",
        instructionsRootPath: "/team",
        cwd: "/agent/workspace",
        customOption: "must-not-carry",
      },
      runtimeConfig: { aiConnection: { provider: "old" }, sessionId: "session-1" },
    });
    const destinationAgent = makeAgent({
      id: "destination-agent",
      adapterType: "anthropic",
      adapterConfig: { endpoint: "https://anthropic.example.test", model: "destination-model" },
      runtimeConfig: { aiConnection: destinationConnection },
    });

    expect(buildSwitchConfig(current, "anthropic", [current, destinationAgent], undefined)).toEqual({
      adapterConfig: {
        endpoint: "https://anthropic.example.test",
        cwd: "/agent/workspace",
        instructionsFilePath: "TEAM.md",
        instructionsRootPath: "/team",
      },
      runtimeConfig: { sessionId: "session-1", aiConnection: destinationConnection },
    });
  });

  it("uses destination schema defaults and omits an old connection when the destination has none", () => {
    const current = makeAgent({
      adapterConfig: { instructionsEntryFile: "AGENTS.md" },
      runtimeConfig: { aiConnection: { provider: "old" }, sessionId: "session-2" },
    });

    expect(buildSwitchConfig(current, "new-provider", [current], [{ key: "endpoint", default: "https://new.example.test" }])).toEqual({
      adapterConfig: {
        endpoint: "https://new.example.test",
        instructionsEntryFile: "AGENTS.md",
      },
      runtimeConfig: { sessionId: "session-2" },
    });
  });
});

describe("rememberTemplates", () => {
  it("stores reusable config for live agents while preserving existing provider templates", () => {
    localStorage.setItem(
      templateStorageKey,
      JSON.stringify({ previous: { adapterConfig: { endpoint: "https://previous.example.test" } } }),
    );
    rememberTemplates([
      makeAgent({
        adapterType: "openai",
        adapterConfig: {
          endpoint: "https://openai.example.test",
          model: "private-model",
          instructionsBundleMode: "single",
        },
        runtimeConfig: { aiConnection: { provider: "openai", accountId: "account-1" } },
      }),
      makeAgent({
        id: "terminated-agent",
        adapterType: "terminated-provider",
        status: "terminated",
        adapterConfig: { endpoint: "https://terminated.example.test" },
      }),
    ]);

    expect(JSON.parse(localStorage.getItem(templateStorageKey) ?? "{}")).toEqual({
      previous: { adapterConfig: { endpoint: "https://previous.example.test" } },
      openai: {
        adapterConfig: { endpoint: "https://openai.example.test" },
        aiConnection: { provider: "openai", accountId: "account-1" },
      },
    });
  });

  it("keeps an existing template when there are no active agents", () => {
    const existingTemplate = {
      openai: { adapterConfig: { endpoint: "https://remembered.example.test" } },
    };
    localStorage.setItem(templateStorageKey, JSON.stringify(existingTemplate));

    rememberTemplates([]);

    expect(JSON.parse(localStorage.getItem(templateStorageKey) ?? "{}")).toEqual(existingTemplate);
  });
});
