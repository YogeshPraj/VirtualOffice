import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { LiveEvent } from "./types";
import { useOffice } from "../state/officeStore";
import { providerLabel } from "./providers";

export const keys = {
  companies: ["companies"] as const,
  agents: (c: string) => ["agents", c] as const,
  issues: (c: string) => ["issues", c] as const,
  comments: (i: string) => ["comments", i] as const,
  interactions: (i: string) => ["interactions", i] as const,
  attention: (c: string) => ["attention", c] as const,
  dashboard: (c: string) => ["dashboard", c] as const,
  activity: (c: string) => ["activity", c] as const,
  org: (c: string) => ["org", c] as const,
  skills: (c: string) => ["skills", c] as const,
  agentSkills: (a: string) => ["agentSkills", a] as const,
  routines: (c: string) => ["routines", c] as const,
  projects: (c: string) => ["projects", c] as const,
  tools: (c: string) => ["tools", c] as const,
  secrets: (c: string) => ["secrets", c] as const,
  adapters: ["adapters"] as const,
};

// Paperclip takes ~20-40 s to boot after a double-click launch: keep retrying (up to ~3 min)
// so the splash says "Unlocking the building…" instead of flashing an error.
export const useCompanies = () =>
  useQuery({ queryKey: keys.companies, queryFn: api.companies, retry: 90, retryDelay: 2000 });

export const useAgents = (companyId: string) =>
  useQuery({ queryKey: keys.agents(companyId), queryFn: () => api.agents(companyId), refetchInterval: 30_000 });

export const useIssues = (companyId: string) =>
  useQuery({ queryKey: keys.issues(companyId), queryFn: () => api.issues(companyId), refetchInterval: 30_000 });

export const useComments = (issueId: string | null) =>
  useQuery({
    queryKey: keys.comments(issueId ?? ""),
    queryFn: () => api.comments(issueId!),
    enabled: !!issueId,
  });

export const useInteractions = (issueId: string | null) =>
  useQuery({
    queryKey: keys.interactions(issueId ?? ""),
    queryFn: () => api.interactions(issueId!),
    enabled: !!issueId,
  });

export const useAttention = (companyId: string) =>
  useQuery({ queryKey: keys.attention(companyId), queryFn: () => api.attention(companyId), refetchInterval: 20_000 });

export const useDashboard = (companyId: string) =>
  useQuery({ queryKey: keys.dashboard(companyId), queryFn: () => api.dashboard(companyId), refetchInterval: 60_000 });

export const useActivity = (companyId: string) =>
  useQuery({ queryKey: keys.activity(companyId), queryFn: () => api.activity(companyId), refetchInterval: 30_000 });

export const RUN_LOG_EVENT = "pixel-office:run-log";

function invalidateFor(qc: QueryClient, companyId: string, event: LiveEvent) {
  const p = event.payload;
  switch (event.type) {
    case "agent.status":
    case "heartbeat.run.status":
    case "heartbeat.run.queued":
      qc.invalidateQueries({ queryKey: keys.agents(companyId) });
      qc.invalidateQueries({ queryKey: keys.dashboard(companyId) });
      qc.invalidateQueries({ queryKey: keys.attention(companyId) });
      break;
    case "activity.logged": {
      qc.invalidateQueries({ queryKey: keys.activity(companyId) });
      qc.invalidateQueries({ queryKey: keys.issues(companyId) });
      qc.invalidateQueries({ queryKey: keys.attention(companyId) });
      if (typeof p.issueId === "string") {
        qc.invalidateQueries({ queryKey: keys.comments(p.issueId) });
        qc.invalidateQueries({ queryKey: keys.interactions(p.issueId) });
      }
      if (p.entityType === "agent") qc.invalidateQueries({ queryKey: keys.agents(companyId) });
      break;
    }
  }
}

/** Subscribes to Paperclip's company live-events WebSocket and keeps queries fresh. */
export function useLiveEvents(companyId: string) {
  const qc = useQueryClient();
  const pushEvent = useOffice((s) => s.pushEvent);
  const setLive = useOffice((s) => s.setLive);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/companies/${companyId}/events/ws`);
      ws.onopen = () => {
        attempt = 0;
        setLive(true);
      };
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(String(msg.data)) as LiveEvent;
          if (!event?.type) return;
          pushEvent(event);
          // The over-the-shoulder view listens for raw run output without it touching the store.
          if (event.type === "heartbeat.run.log") window.dispatchEvent(new CustomEvent(RUN_LOG_EVENT, { detail: event.payload }));
          invalidateFor(qc, companyId, event);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setLive(false);
        if (closed) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      if (!ws) return;
      // Closing a socket that is still connecting logs a browser warning (React dev mode
      // mounts effects twice). Let it finish opening, then close it quietly.
      if (ws.readyState === WebSocket.CONNECTING) {
        const pending = ws;
        pending.onopen = () => pending.close();
        pending.onmessage = null;
        pending.onclose = null;
      } else {
        ws.close();
      }
    };
  }, [companyId, qc, pushEvent, setLive]);
}

// ── Basement (B1) ───────────────────────────────────────────────────────
export const useOrg = (companyId: string) => useQuery({ queryKey: keys.org(companyId), queryFn: () => api.org(companyId) });
export const useCompanySkills = (companyId: string) =>
  useQuery({ queryKey: keys.skills(companyId), queryFn: () => api.companySkills(companyId) });
export const useSkillCatalog = () => useQuery({ queryKey: ["skillCatalog"], queryFn: api.skillCatalog, staleTime: 5 * 60_000 });
export const useAgentSkills = (agentId: string | null) =>
  useQuery({ queryKey: keys.agentSkills(agentId ?? ""), queryFn: () => api.agentSkills(agentId!), enabled: !!agentId });
export const useRoutines = (companyId: string) =>
  useQuery({ queryKey: keys.routines(companyId), queryFn: () => api.routines(companyId), refetchInterval: 60_000 });
export const useProjects = (companyId: string) =>
  useQuery({ queryKey: keys.projects(companyId), queryFn: () => api.projects(companyId) });
export const useToolConnections = (companyId: string) =>
  useQuery({
    queryKey: keys.tools(companyId),
    queryFn: () => api.toolConnections(companyId).then((r) => r.connections),
    // Health flips when a sign-in expires or is renewed; the HUD banner depends on it.
    refetchInterval: 20_000,
  });
export const useToolGallery = (companyId: string) =>
  useQuery({ queryKey: ["toolGallery", companyId], queryFn: () => api.toolGallery(companyId).then((r) => r.apps), staleTime: 5 * 60_000 });
export const useSecrets = (companyId: string) => useQuery({ queryKey: keys.secrets(companyId), queryFn: () => api.secrets(companyId) });
export const useAdapters = () => useQuery({ queryKey: keys.adapters, queryFn: api.adapters, staleTime: 60_000 });

/** Human name of the AI provider behind an adapter type (falls back to a readable type key). */
export function useProviderName(adapterType: string): string {
  const { data } = useAdapters();
  const info = data?.find((a) => a.type === adapterType);
  return providerLabel(info ?? { type: adapterType, label: adapterType });
}
