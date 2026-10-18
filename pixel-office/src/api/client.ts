import type {
  ActivityEntry,
  RecoveryAction,
  AdapterInfo,
  AgentSkillSnapshot,
  CatalogSkill,
  CompanySkill,
  EnvironmentTestResult,
  GalleryApp,
  OrgNode,
  Project,
  Routine,
  Secret,
  ToolConnection,
  Agent,
  Approval,
  AttentionFeed,
  Company,
  Dashboard,
  Interaction,
  Issue,
  IssueComment,
  IssueStatus,
  HeartbeatRun,
  WorkProduct,
  Attachment,
  WindowSpend,
  IssueDocument,
  DocumentRevision,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `${method} ${path} failed (${res.status})`);
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown = {}) => request<T>("POST", path, body);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

export interface HirePayload {
  name: string;
  role: string;
  title?: string;
  capabilities?: string;
  reportsTo?: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  applyStoredClaudeLogin?: boolean;
}

export const api = {
  companies: () => get<Company[]>("/companies"),
  createCompany: (body: { name: string; description?: string }) => post<Company>("/companies", body),

  agents: (companyId: string) => get<Agent[]>(`/companies/${companyId}/agents`),
  models: (companyId: string, adapterType: string) =>
    get<{ id: string; label: string }[]>(`/companies/${companyId}/adapters/${adapterType}/models`),
  adapterSchema: (adapterType: string) =>
    get<{ fields: { key: string; default?: unknown }[] }>(`/adapters/${adapterType}/config-schema`).catch(() => ({ fields: [] })),
  terminateAgent: (agentId: string) => post(`/agents/${agentId}/terminate`, {}),
  hire: (companyId: string, body: HirePayload) =>
    post<{ agent: Agent; approval: Approval | null }>(`/companies/${companyId}/agent-hires`, body),
  wakeAgent: (agentId: string) => post(`/agents/${agentId}/wakeup`, {}),
  pauseAgent: (agentId: string) => post(`/agents/${agentId}/pause`, {}),
  resumeAgent: (agentId: string) => post(`/agents/${agentId}/resume`, {}),
  clearAgentError: (agentId: string) => post<Agent>(`/agents/${agentId}/clear-error`, {}),
  /** Empty string = Paperclip's default model. adapterConfig patches merge shallowly. */
  setAgentModel: (agentId: string, model: string) => patch<Agent>(`/agents/${agentId}`, { adapterConfig: { model } }),
  switchAgentProvider: async (
    agentId: string,
    adapterType: string,
    adapterConfig: Record<string, unknown>,
    runtimeConfig: Record<string, unknown>,
  ) => {
    const body = { adapterType, adapterConfig, runtimeConfig, replaceAdapterConfig: true };
    try {
      return await patch<Agent>(`/agents/${agentId}`, body);
    } catch (e) {
      // Paperclip keeps re-applying the old vendor sign-in, which the new provider can't use.
      if (!(e instanceof ApiError) || e.status !== 422 || !/AI connection compatible/i.test(e.message)) throw e;
      const res = await fetch("/office-admin/detach-ai-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) throw new Error(`Could not detach the old sign-in: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return patch<Agent>(`/agents/${agentId}`, body);
    }
  },

  issues: (companyId: string) => get<Issue[]>(`/companies/${companyId}/issues`),
  issue: (issueId: string) => get<Issue>(`/issues/${issueId}`),
  workProducts: (issueId: string) => get<WorkProduct[]>(`/issues/${issueId}/work-products`),
  addWorkProduct: (issueId: string, body: Partial<WorkProduct> & Pick<WorkProduct, "type" | "provider" | "title">) =>
    post<WorkProduct>(`/issues/${issueId}/work-products`, body),
  updateWorkProduct: (id: string, body: Partial<Pick<WorkProduct, "reviewState" | "status" | "isPrimary">>) => patch<WorkProduct>(`/work-products/${id}`, body),
  attachments: (issueId: string) => get<Attachment[]>(`/issues/${issueId}/attachments`),
  uploadAttachment: async (companyId: string, issueId: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`/api/companies/${companyId}/issues/${issueId}/attachments`, { method: "POST", credentials: "include", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Upload failed (${res.status})`);
    return data as Attachment;
  },
  issueDocuments: (issueId: string) => get<IssueDocument[]>(`/issues/${issueId}/documents`),
  documentRevisions: (issueId: string, key: string) =>
    get<DocumentRevision[] | { items: DocumentRevision[] }>(`/issues/${issueId}/documents/${encodeURIComponent(key)}/revisions`).then((r) => (Array.isArray(r) ? r : r.items)),
  restoreRevision: (issueId: string, key: string, revisionId: string) =>
    post<IssueDocument>(`/issues/${issueId}/documents/${encodeURIComponent(key)}/revisions/${revisionId}/restore`, {}),
  recoveryActions: (issueId: string) =>
    get<RecoveryAction[] | { actions?: RecoveryAction[]; items?: RecoveryAction[] }>(`/issues/${issueId}/recovery-actions`).then((r) =>
      Array.isArray(r) ? r : (r.actions ?? r.items ?? []),
    ),
  resolveRecovery: (
    issueId: string,
    body: {
      actionId?: string;
      outcome: "restored" | "false_positive" | "blocked" | "cancelled";
      sourceIssueStatus: "todo" | "done" | "in_review" | "blocked";
      resolutionNote?: string | null;
      executionReconciliation?: { runId: string; providerStopped: true; actionOutcome: "completed" | "not_performed" | "mixed"; outcomeEvidence: string };
    },
  ) => post(`/issues/${issueId}/recovery-actions/resolve`, body),
  /** Wake an employee on a specific task (same as the classic "nudge"). */
  wakeOnIssue: (agentId: string, issueId: string, reason: string) =>
    post(`/agents/${agentId}/wakeup`, { source: "on_demand", triggerDetail: "manual", reason, payload: { issueId }, forceFreshSession: false }),
  /** An employee's most recent runs, newest first. */
  agentRuns: (companyId: string, agentId: string, limit = 3) =>
    get<HeartbeatRun[]>(`/companies/${companyId}/heartbeat-runs?agentId=${agentId}&limit=${limit}`).then((runs) => runs.filter((r) => r.agentId === agentId)),
  /** A run's stored output (ndjson). Paperclip pages it by byte offset; long runs keep only the tail. */
  /** A task's runs, newest first. */
  issueRuns: (issueId: string) =>
    get<
      { runId: string; agentId: string; status: string; startedAt: string | null; finishedAt: string | null; createdAt: string; errorCode: string | null; error: string | null; scheduledRetryAt: string | null }[]
    >(`/issues/${issueId}/runs`),
  runLog: async (runId: string, totalBytes: number | null, maxBytes = 3_000_000) => {
    let offset = Math.max(0, (totalBytes ?? 0) - maxBytes);
    let content = "";
    for (let page = 0; page < 40; page++) {
      const r = await get<{ content: string; nextOffset?: number | null }>(`/heartbeat-runs/${runId}/log?offset=${offset}`);
      content += r.content ?? "";
      if (!r.nextOffset || r.nextOffset <= offset) break;
      offset = r.nextOffset;
    }
    return content;
  },
  issueBlockers: (issueId: string) =>
    get<{
      diagnosis: string | null;
      blockers: { id: string; identifier: string; title: string; status: string; assigneeAgentId: string | null }[];
    }>(`/issues/${issueId}/diagnostics/blockers`),
  createIssue: (
    companyId: string,
    body: { title: string; description?: string; assigneeAgentId?: string | null; status?: IssueStatus; priority?: string; projectId?: string | null; parentId?: string | null; workMode?: "standard" | "ask" | "planning" },
  ) => post<Issue>(`/companies/${companyId}/issues`, body),
  updateIssue: (
    issueId: string,
    body: Partial<Pick<Issue, "status" | "assigneeAgentId" | "title" | "priority" | "projectId" | "parentId">> & { blockedByIssueIds?: string[] },
  ) =>
    patch<Issue>(`/issues/${issueId}`, body),
  comments: (issueId: string) => get<IssueComment[]>(`/issues/${issueId}/comments`),
  addComment: (issueId: string, body: string) => post<IssueComment>(`/issues/${issueId}/comments`, { body }),

  interactions: (issueId: string) => get<Interaction[]>(`/issues/${issueId}/interactions`),
  respond: (
    issueId: string,
    interactionId: string,
    answers: { questionId: string; optionIds: string[]; otherText?: string | null }[],
  ) => post(`/issues/${issueId}/interactions/${interactionId}/respond`, { answers }),

  /** An agent asked for a connection (e.g. "Connect Anthropic"): give it an existing one. */
  adoptAiConnection: (companyId: string, agentId: string, interactionId: string, connectionId: string) =>
    post(`/agents/${agentId}/connection-intents/${interactionId}/adopt?companyId=${encodeURIComponent(companyId)}`, { connectionId }),
  connectionIntentOptions: (interactionId: string) =>
    get<{
      aiConnectionRequiresAdoption?: { connectionId?: string } | string | null;
      aiRepair?: { connection?: { id: string; name: string; status: string } | null } | null;
      existingConnections?: { id: string; name: string; status: string; enabled: boolean }[];
    }>(`/connection-intents/${interactionId}/setup-options`),
  completeConnectionIntent: (interactionId: string, connectionId: string) =>
    post(`/connection-intents/${interactionId}/complete`, { connectionId }),
  declineConnectionIntent: (interactionId: string) => post(`/connection-intents/${interactionId}/decline`, {}),
  acceptInteraction: (issueId: string, interactionId: string, selectedOptionIds?: string[]) =>
    post(`/issues/${issueId}/interactions/${interactionId}/accept`, selectedOptionIds ? { selectedOptionIds } : {}),
  rejectInteraction: (issueId: string, interactionId: string, reason?: string) =>
    post(`/issues/${issueId}/interactions/${interactionId}/reject`, reason ? { reason } : {}),

  attention: (companyId: string) => get<AttentionFeed>(`/companies/${companyId}/attention`),
  approval: (id: string) => get<Approval>(`/approvals/${id}`),
  approve: (id: string) => post(`/approvals/${id}/approve`, {}),
  reject: (id: string) => post(`/approvals/${id}/reject`, {}),

  goals: (companyId: string) => get<{ id: string; title: string; description: string | null; level: string; status: string }[]>(`/companies/${companyId}/goals`),
  createGoal: (companyId: string, body: { title: string; description?: string; level?: string; status?: string }) =>
    post(`/companies/${companyId}/goals`, body),
  costsSummary: (companyId: string) => get<Record<string, unknown>>(`/companies/${companyId}/costs/summary`),

  costsByAgent: (companyId: string, from?: string) =>
    get<{ agentId: string; agentName: string; costCents: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; subscriptionRunCount: number; apiRunCount: number }[]>(
      `/companies/${companyId}/costs/by-agent${from ? `?from=${encodeURIComponent(from)}` : ""}`,
    ),
  windowSpend: (companyId: string) => get<WindowSpend[]>(`/companies/${companyId}/costs/window-spend`),
  recentRuns: (companyId: string, limit = 100) => get<HeartbeatRun[]>(`/companies/${companyId}/heartbeat-runs?limit=${limit}`),
  dashboard: (companyId: string) => get<Dashboard>(`/companies/${companyId}/dashboard`),
  activity: (companyId: string) => get<ActivityEntry[]>(`/companies/${companyId}/activity`),

  // ── Basement (B1) ─────────────────────────────────────────────────────
  updateCompany: (
    companyId: string,
    body: Partial<{ name: string; description: string; budgetMonthlyCents: number; requireBoardApprovalForNewAgents: boolean; status: "active" | "paused" }>,
  ) => patch<Company>(`/companies/${companyId}`, body),

  org: (companyId: string) => get<OrgNode[]>(`/companies/${companyId}/org`),
  updateAgent: (agentId: string, body: { reportsTo?: string | null; title?: string; capabilities?: string; budgetMonthlyCents?: number }) =>
    patch<Agent>(`/agents/${agentId}`, body),

  companySkills: (companyId: string) => get<CompanySkill[]>(`/companies/${companyId}/skills`),
  skillFile: (companyId: string, skillId: string, path: string) =>
    get<{ path: string; content: string }>(`/companies/${companyId}/skills/${skillId}/files?path=${encodeURIComponent(path)}`),
  saveSkillFile: (companyId: string, skillId: string, path: string, content: string) =>
    patch(`/companies/${companyId}/skills/${skillId}/files`, { path, content }),
  skillCatalog: () => get<CatalogSkill[]>(`/skills/catalog`),
  installCatalogSkill: (companyId: string, catalogSkillId: string) =>
    post<{ action: string; skill: CompanySkill; warnings: string[] }>(`/companies/${companyId}/skills/install-catalog`, { catalogSkillId }),
  agentSkills: (agentId: string) => get<AgentSkillSnapshot>(`/agents/${agentId}/skills`),
  syncAgentSkills: (agentId: string, desiredSkills: string[]) =>
    post<AgentSkillSnapshot>(`/agents/${agentId}/skills/sync`, { mode: "replace", desiredSkills }),

  routines: (companyId: string) => get<Routine[]>(`/companies/${companyId}/routines`),
  createRoutine: (companyId: string, body: { title: string; description?: string; assigneeAgentId?: string | null; status?: string }) =>
    post<Routine>(`/companies/${companyId}/routines`, body),
  addScheduleTrigger: (routineId: string, cronExpression: string, timezone: string, label?: string) =>
    post(`/routines/${routineId}/triggers`, { kind: "schedule", cronExpression, timezone, label, enabled: true }),
  updateRoutine: (routineId: string, body: Partial<{ status: string; assigneeAgentId: string | null; title: string }>) =>
    patch<Routine>(`/routines/${routineId}`, body),
  runRoutine: (routineId: string) => post(`/routines/${routineId}/run`, { source: "manual" }),

  projects: (companyId: string) => get<Project[]>(`/companies/${companyId}/projects`),
  createProject: (
    companyId: string,
    body: {
      name: string;
      description?: string;
      leadAgentId?: string | null;
      status?: string;
      workspace?: { name?: string; sourceType: "local_path" | "git_repo"; cwd?: string; repoUrl?: string; isPrimary?: boolean };
    },
  ) => post<Project>(`/companies/${companyId}/projects`, body),
  updateProject: (projectId: string, body: Partial<{ status: string; leadAgentId: string | null; name: string; description: string }>) =>
    patch<Project>(`/projects/${projectId}`, body),

  toolConnections: (companyId: string) => get<{ connections: ToolConnection[] }>(`/companies/${companyId}/tools/connections`),
  toolGallery: (companyId: string) => get<{ apps: GalleryApp[] }>(`/companies/${companyId}/tools/gallery`),

  secrets: (companyId: string) => get<Secret[]>(`/companies/${companyId}/secrets`),
  createSecret: (companyId: string, body: { name: string; key?: string; value: string; description?: string }) =>
    post<Secret>(`/companies/${companyId}/secrets`, { ...body, provider: "local_encrypted", managedMode: "paperclip_managed" }),
  rotateSecret: (secretId: string, value: string) => post<Secret>(`/secrets/${secretId}/rotate`, { value }),
  deleteSecret: (secretId: string) => del(`/secrets/${secretId}`),

  adapters: () => get<AdapterInfo[]>(`/adapters`),
  setAdapterDisabled: (type: string, disabled: boolean) => patch(`/adapters/${type}`, { disabled }),
  testAdapter: (companyId: string, type: string) =>
    post<EnvironmentTestResult>(`/companies/${companyId}/adapters/${type}/test-environment`, {}),
};
