import type { Agent, AdapterInfo } from "./types";

/** Config keys that belong to one specific employee, never to a reusable template. */
const PER_AGENT_KEYS = new Set([
  "model",
  "cwd",
  "instructionsFilePath",
  "instructionsRootPath",
  "instructionsEntryFile",
  "instructionsBundleMode",
  "paperclipSkillSync",
]);

export interface ConfigSchemaField {
  key: string;
  default?: unknown;
}

/** An adapter that can power an employee's brain: loaded, enabled and offering models. */
export const isProvider = (a: AdapterInfo) => a.loaded && !a.disabled && a.modelsCount > 0;

/** Adapters ship a machine label; fall back to a readable form of the type key. */
export function providerLabel(a: Pick<AdapterInfo, "type" | "label">): string {
  if (a.label && a.label !== a.type) return a.label;
  return a.type
    .replace(/_local$/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The provider most of the current staff already use; the best default for a new hire. */
export function dominantProvider(providers: AdapterInfo[], agents: Agent[]): string {
  const counts = new Map<string, number>();
  for (const a of agents) if (a.status !== "terminated") counts.set(a.adapterType, (counts.get(a.adapterType) ?? 0) + 1);
  const ranked = providers.map((p) => p.type).sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0));
  return ranked[0] ?? "";
}

/**
 * Config for moving an existing employee to another provider: the new adapter's starting
 * config plus the per-employee keys (instructions, skills) that must survive the move.
 */
export function buildSwitchConfig(
  current: Agent,
  nextType: string,
  agents: Agent[],
  schema: ConfigSchemaField[] | undefined,
): { adapterConfig: Record<string, unknown>; runtimeConfig: Record<string, unknown> } {
  const others = agents.filter((a) => a.id !== current.id);
  const { adapterConfig, aiConnection } = buildHireConfig(nextType, others, schema, "");
  for (const [k, v] of Object.entries(current.adapterConfig ?? {})) {
    if (PER_AGENT_KEYS.has(k) && k !== "model") adapterConfig[k] = v;
  }
  const { aiConnection: _old, ...runtime } = (current.runtimeConfig ?? {}) as Record<string, unknown>;
  return { adapterConfig, runtimeConfig: aiConnection ? { ...runtime, aiConnection } : runtime };
}

interface Template {
  adapterConfig: Record<string, unknown>;
  aiConnection?: unknown;
}

const MEMORY_KEY = "pixel-office.provider-templates";

function readMemory(): Record<string, Template> {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Remember a working setup per provider while any employee is on it, so moving everyone to
 * another provider and back later still restores the sign-in connection and tuned settings.
 */
export function rememberTemplates(agents: Agent[]): void {
  const memory = readMemory();
  for (const a of agents) {
    if (a.status === "terminated") continue;
    const adapterConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.adapterConfig ?? {})) if (!PER_AGENT_KEYS.has(k)) adapterConfig[k] = v;
    const aiConnection = (a.runtimeConfig as { aiConnection?: unknown } | undefined)?.aiConnection;
    memory[a.adapterType] = { adapterConfig, aiConnection };
  }
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: templates just won't be remembered.
  }
}

/** True when an error message means the provider's plan or rate limit is used up. */
export const isLimitReason = (reason: string | null | undefined) =>
  !!reason && /quota|rate.?limit|usage limit|limit (reached|exceeded|hit)|out of (credits|usage)|credits? (limit|exhausted)|premium requests?/i.test(reason);

/**
 * Starting config for a new hire on `adapterType`. Prefers what an existing employee on the
 * same adapter already runs with (so working setups are cloned), then a remembered setup,
 * otherwise the adapter's own published schema defaults.
 */
export function buildHireConfig(
  adapterType: string,
  agents: Agent[],
  schema: ConfigSchemaField[] | undefined,
  model: string,
): { adapterConfig: Record<string, unknown>; aiConnection?: unknown } {
  const live = agents.find((a) => a.adapterType === adapterType && a.status !== "terminated");
  const template: Template | undefined = live
    ? { adapterConfig: live.adapterConfig ?? {}, aiConnection: (live.runtimeConfig as { aiConnection?: unknown } | undefined)?.aiConnection }
    : readMemory()[adapterType];
  const base: Record<string, unknown> = {};
  if (template) {
    for (const [k, v] of Object.entries(template.adapterConfig)) if (!PER_AGENT_KEYS.has(k)) base[k] = v;
  } else {
    for (const f of schema ?? []) if (f.default !== undefined && f.default !== "" && !PER_AGENT_KEYS.has(f.key)) base[f.key] = f.default;
  }
  if (model) base.model = model;
  return { adapterConfig: base, aiConnection: template?.aiConnection };
}
