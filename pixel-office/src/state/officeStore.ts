import { create } from "zustand";
import type { LiveEvent } from "../api/types";

/** Rooms double as navigation: clicking a room opens its panel. */
export type GroundRoomId =
  | "lobby"
  | "hr"
  | "floor"
  | "ceo"
  | "study"
  | "intake"
  | "report"
  | "status"
  | "meeting"
  | "lounge"
  | "finance"
  | "security"
  | "basement";
/** Rooms on the lower floor (B1): the building's machinery. */
export type BasementRoomId = "settings" | "org" | "skills" | "routines" | "projects" | "tools" | "vault" | "adapters";
export type RoomId = GroundRoomId | BasementRoomId;
export type Floor = "ground" | "basement";

export type Panel =
  | { kind: "room"; room: RoomId }
  | { kind: "agent"; agentId: string }
  | { kind: "issue"; issueId: string }
  | null;

interface OfficeState {
  live: boolean;
  events: LiveEvent[];
  /** agentId → epoch ms of the most recent run output, used to animate typing. */
  lastOutputAt: Record<string, number>;
  panel: Panel;
  floor: Floor;
  goFloor: (floor: Floor) => void;
  setLive: (live: boolean) => void;
  pushEvent: (event: LiveEvent) => void;
  open: (panel: Panel) => void;
  close: () => void;
}

const MAX_EVENTS = 150;

export const useOffice = create<OfficeState>((set) => ({
  live: false,
  events: [],
  lastOutputAt: {},
  panel: null,
  floor: "ground",
  goFloor: (floor) => set({ floor, panel: null }),
  setLive: (live) => set({ live }),
  pushEvent: (event) =>
    set((s) => {
      const agentId = typeof event.payload.agentId === "string" ? event.payload.agentId : null;
      // High-volume run streams only matter for "is someone typing" — don't keep every line.
      const isOutput =
        event.type === "heartbeat.run.log" ||
        event.type === "heartbeat.run.event" ||
        event.type === "heartbeat.run.progress";
      return {
        events: isOutput ? s.events : [event, ...s.events].slice(0, MAX_EVENTS),
        lastOutputAt: agentId && isOutput ? { ...s.lastOutputAt, [agentId]: Date.now() } : s.lastOutputAt,
      };
    }),
  open: (panel) => set({ panel }),
  close: () => set({ panel: null }),
}));
