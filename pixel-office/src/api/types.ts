// Subset of Paperclip's API shapes that the pixel office reads.
// Source of truth: GET /api/openapi.json on the running Paperclip server.

export type AgentStatus =
  | "active"
  | "paused"
  | "idle"
  | "running"
  | "error"
  | "pending_approval"
  | "terminated";

export const AGENT_ROLES = [
  "ceo",
  "cto",
  "cmo",
  "cfo",
  "security",
  "engineer",
  "designer",
  "pm",
  "qa",
  "devops",
  "researcher",
  "general",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

export interface Company {
  id: string;
  name: string;
  description: string | null;
  issuePrefix: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  status?: "active" | "paused" | "archived";
  requireBoardApprovalForNewAgents?: boolean;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role: AgentRole;
  title: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  pauseReason: string | null;
  errorReason: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: "critical" | "high" | "medium" | "low";
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
  parentId: string | null;
  workMode?: "standard" | "ask" | "planning" | "skill_test" | string;
  startedAt?: string | null;
  completedAt?: string | null;
  hiddenAt?: string | null;
  /** Only on a single-issue fetch. */
  blockedBy?: IssueRef[];
  blocks?: IssueRef[];
  createdAt: string;
  updatedAt: string;
}

export interface IssueRef {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assigneeAgentId?: string | null;
}

export interface IssueComment {
  id: string;
  issueId: string;
  body: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  createdAt: string;
}

export interface Dashboard {
  agents: { active: number; running: number; paused: number; error: number };
  tasks: { open: number; inProgress: number; blocked: number; done: number };
  costs: { monthSpendCents: number; monthBudgetCents: number; monthUtilizationPercent: number };
  pendingApprovals: number;
}

export interface AttentionItem {
  sourceKind: string;
  subject: {
    kind: string;
    id: string;
    title: string;
    identifier: string | null;
    status: string;
    href: string;
    metadata?: Record<string, unknown>;
  };
  whyNow: string;
  severity: "low" | "medium" | "high" | "critical";
  inlineResolvable: boolean;
  decisionVerbs: { id: string; label: string; description?: string }[];
  relatedIssue?: { id: string; identifier?: string; title?: string } | null;
  createdAt: string;
}

export interface AttentionFeed {
  totalCount: number;
  items: AttentionItem[];
}

export interface QuestionOption {
  id: string;
  label: string;
  description?: string | null;
  freeText?: boolean;
}

export interface Interaction {
  id: string;
  issueId: string;
  kind: string;
  status: string;
  createdByAgentId: string | null;
  title: string | null;
  summary: string | null;
  payload: {
    submitLabel?: string;
    questions?: {
      id: string;
      prompt: string;
      helpText?: string | null;
      selectionMode: "single" | "multiple";
      required?: boolean;
      options: QuestionOption[];
    }[];
  } & Record<string, unknown>;
}

export interface Approval {
  id: string;
  type: string;
  status: string;
  requestedByAgentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface LiveEvent {
  id: number;
  companyId: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

// ── Basement (B1) shapes ────────────────────────────────────────────────
export interface OrgNode {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  reports: OrgNode[];
}

export interface CompanySkill {
  id: string;
  key: string;
  slug: string;
  name: string;
  description: string | null;
  folderPath: string | null;
  trustLevel: string;
  categories: string[];
}

export interface CatalogSkill {
  id: string;
  key: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  kind: string;
  recommendedForRoles: string[];
  tags: string[];
}

export interface AgentSkillSnapshot {
  adapterType: string;
  supported: boolean;
  desiredSkills: string[];
  warnings: string[];
}

export interface RoutineTriggerSummary {
  id: string;
  kind: string;
  label: string | null;
  enabled: boolean;
  cronExpression: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastFiredAt: string | null;
}

export interface Routine {
  id: string;
  title: string;
  description: string | null;
  assigneeAgentId: string | null;
  status: "active" | "paused" | "archived";
  priority: string;
  lastTriggeredAt: string | null;
  triggers: RoutineTriggerSummary[];
  lastRun: { status?: string; createdAt?: string } | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leadAgentId: string | null;
  taskCount: number;
  archivedAt: string | null;
  codebase: {
    repoUrl: string | null;
    localFolder: string | null;
    effectiveLocalFolder: string | null;
    origin: string | null;
  } | null;
}

export interface ToolConnection {
  id: string;
  name: string;
  connectionKind: string;
  connectionPurpose: string;
  transport: string;
  status: string;
  enabled: boolean;
  healthStatus: string | null;
  healthMessage: string | null;
  lastError: string | null;
}

export interface GalleryApp {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  featured: boolean;
}

export interface Secret {
  id: string;
  key: string;
  name: string;
  provider: string;
  status: string;
  latestVersion: number;
  description: string | null;
  lastRotatedAt: string | null;
  referenceCount?: number;
  createdAt: string;
}

export interface AdapterInfo {
  type: string;
  label: string;
  source: string;
  modelsCount: number;
  loaded: boolean;
  disabled: boolean;
  capabilities: Record<string, unknown>;
}

export interface EnvironmentTestResult {
  adapterType: string;
  status: "pass" | "warn" | "fail";
  checks: { code: string; level: string; message: string; detail?: string | null; hint?: string | null }[];
  testedAt: string;
}

export interface RecoveryAction {
  id: string;
  kind: string;
  status: string;
  cause: string;
  nextAction: string;
  evidence: Record<string, unknown>;
  sourceRunId?: string | null;
  previousOwnerAgentId: string | null;
  ownerType: string;
  attemptCount: number;
  createdAt: string;
}

export interface HeartbeatRun {
  id: string;
  agentId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  logBytes: number | null;
  contextSnapshot?: { issueId?: string } | null;
}

export interface IssueDocument {
  id: string;
  issueId: string;
  key: string;
  title: string | null;
  format: string;
  body: string;
  latestRevisionId: string | null;
  latestRevisionNumber: number;
  createdByAgentId: string | null;
  updatedByAgentId: string | null;
  updatedByUserId: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRevision {
  id: string;
  documentId: string;
  key: string;
  revisionNumber: number;
  title: string | null;
  format: string;
  body: string;
  changeSummary: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface WindowSpend {
  provider: string;
  biller: string;
  window: string;
  windowHours: number;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface Attachment {
  id: string;
  issueId: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface WorkProduct {
  id: string;
  issueId: string;
  projectId: string | null;
  type: "preview_url" | "runtime_service" | "pull_request" | "branch" | "commit" | "artifact" | "document";
  provider: string;
  externalId: string | null;
  title: string;
  url: string | null;
  status: string;
  reviewState: "none" | "needs_board_review" | "approved" | "changes_requested";
  isPrimary: boolean;
  healthStatus: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
