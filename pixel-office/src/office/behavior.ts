import type { Agent } from "../api/types";
import type { Expression } from "../pixel/sprite";
import { SPOTS, type DeskSlot, type Pt } from "./layout";

export type Activity =
  | "typing" // a heartbeat run is executing
  | "idle" // at desk, nothing running
  | "sleeping" // paused
  | "error" // last run failed / agent in error
  | "waiting" // hired, waiting for board approval in the lobby
  | "asking" // needs the human: queued at the CEO office door
  | "coffee" // wandering in the lounge
  | "board"; // reading the task board

export interface Behavior {
  target: Pt;
  activity: Activity;
  expression: Expression;
  facing: "down" | "up";
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WANDER_PERIOD_MS = 40_000;
const RECENT_OUTPUT_MS = 20_000;

export interface BehaviorInput {
  agent: Agent;
  desk: DeskSlot;
  /** Position in the CEO queue if this agent is waiting on the human, else -1. */
  askingIndex: number;
  /** Index among agents waiting in the lobby, else -1. */
  lobbyIndex: number;
  lastOutputAt: number | undefined;
  now: number;
  /** Seat at the planning meeting this agent is in, else -1. */
  meetingIndex?: number;
}

export function decideBehavior({ agent, desk, askingIndex, lobbyIndex, lastOutputAt, now, meetingIndex = -1 }: BehaviorInput): Behavior {
  const seat = desk.seat;
  // In a planning meeting: at the table, thinking aloud when it's their turn.
  if (meetingIndex >= 0 && agent.status !== "pending_approval" && agent.status !== "paused") {
    const speaking = agent.status === "running" || (!!lastOutputAt && now - lastOutputAt < RECENT_OUTPUT_MS);
    return { target: SPOTS.meetingSeat(meetingIndex), activity: speaking ? "asking" : "board", expression: speaking ? "focused" : "normal", facing: "up" };
  }
  if (agent.status === "pending_approval") {
    return { target: SPOTS.lobbyWait(Math.max(0, lobbyIndex)), activity: "waiting", expression: "normal", facing: "down" };
  }
  if (agent.status === "running" || (lastOutputAt && now - lastOutputAt < RECENT_OUTPUT_MS)) {
    return { target: seat, activity: "typing", expression: "focused", facing: "up" };
  }
  if (askingIndex >= 0) {
    return { target: SPOTS.ceoQueue(askingIndex), activity: "asking", expression: "confused", facing: "up" };
  }
  if (agent.status === "error") {
    return { target: seat, activity: "error", expression: "surprised", facing: "down" };
  }
  if (agent.status === "paused") {
    return { target: seat, activity: "sleeping", expression: "sleepy", facing: "down" };
  }

  // Idle: drift between the desk, the lounge and the task board on a slow, per-agent rhythm.
  const h = hash(agent.id);
  const phase = Math.floor((now + (h % WANDER_PERIOD_MS)) / WANDER_PERIOD_MS);
  const roll = hash(`${agent.id}:${phase}`) % 10;
  if (roll < 5) return { target: seat, activity: "idle", expression: "normal", facing: "down" };
  if (roll < 8) return { target: SPOTS.lounge(h + phase), activity: "coffee", expression: "happy", facing: "down" };
  return { target: SPOTS.boardFront(h + phase), activity: "board", expression: "normal", facing: "up" };
}
