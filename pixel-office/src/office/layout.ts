import type { RoomId } from "../state/officeStore";

/** World coordinates: the whole building is drawn in a fixed SVG viewBox. */
export const WORLD_W = 960;
export const WORLD_H = 640;

export interface Pt {
  x: number;
  y: number;
}

export interface Room {
  id: RoomId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
  /** Where people step through to reach the main floor (the corridor). */
  door: Pt;
}

const TOP = 170;
const BOTTOM = 430;

export const ROOMS: Room[] = [
  { id: "lobby", label: "LOBBY", x: 0, y: 0, w: 300, h: TOP, floor: "#c9b28a", door: { x: 150, y: TOP } },
  { id: "hr", label: "HR · HIRING", x: 300, y: 0, w: 230, h: TOP, floor: "#b9c7a4", door: { x: 415, y: TOP } },
  { id: "ceo", label: "CEO OFFICE", x: 530, y: 0, w: 250, h: TOP, floor: "#8c6a52", door: { x: 655, y: TOP } },
  { id: "meeting", label: "MEETING · TASK BOARD", x: 780, y: 0, w: 180, h: BOTTOM, floor: "#a9b4c8", door: { x: 780, y: TOP + 20 } },
  { id: "floor", label: "MAIN FLOOR", x: 0, y: TOP, w: 780, h: BOTTOM - TOP, floor: "#d8cdb6", door: { x: 390, y: 300 } },
  { id: "lounge", label: "LOUNGE · #GENERAL", x: 0, y: BOTTOM, w: 300, h: WORLD_H - BOTTOM, floor: "#c7a98f", door: { x: 150, y: BOTTOM } },
  { id: "finance", label: "FINANCE", x: 300, y: BOTTOM, w: 190, h: WORLD_H - BOTTOM, floor: "#b8c0a0", door: { x: 395, y: BOTTOM } },
  { id: "security", label: "SECURITY CAM", x: 490, y: BOTTOM, w: 180, h: WORLD_H - BOTTOM, floor: "#9a9aaa", door: { x: 580, y: BOTTOM } },
  { id: "basement", label: "STAIRS ▼ B1 · MACHINERY", x: 670, y: BOTTOM, w: 290, h: WORLD_H - BOTTOM, floor: "#7a7a86", door: { x: 815, y: BOTTOM } },
];

export const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, Room>;

/** Desk slots on the main floor, filled in hire order. */
export interface DeskSlot {
  /** Top-left of the desk sprite. */
  desk: Pt;
  /** Where the agent stands/sits (behind the desk, facing the viewer). */
  seat: Pt;
}

const DESK_COLS = 7;
const DESK_ROWS = 3;
const DESK_W = 64;

export function deskSlots(count: number): DeskSlot[] {
  const area = { x: 30, y: TOP + 36, w: 720, h: BOTTOM - TOP - 60 };
  const capacity = DESK_COLS * DESK_ROWS;
  const n = Math.max(count, 1);
  const out: DeskSlot[] = [];
  for (let i = 0; i < Math.min(n, capacity); i++) {
    const col = i % DESK_COLS;
    const row = Math.floor(i / DESK_COLS);
    // Leave a centre aisle so the walkway stays clear.
    const aisle = col >= Math.ceil(DESK_COLS / 2) ? 40 : 0;
    const x = area.x + col * ((area.w - 40) / DESK_COLS) + aisle;
    const y = area.y + row * (area.h / DESK_ROWS) + 26;
    out.push({ desk: { x, y }, seat: { x: x + DESK_W / 2, y: y + 2 } });
  }
  return out;
}

export const DESK_CAPACITY = DESK_COLS * DESK_ROWS;

/** Fixed spots for off-desk activities. */
export const SPOTS = {
  ceoChair: { x: 690, y: 88 },
  ceoQueue: (i: number): Pt => ({ x: 600 - (i % 4) * 22, y: 140 - Math.floor(i / 4) * 18 }),
  lobbyWait: (i: number): Pt => ({ x: 60 + (i % 6) * 30, y: 130 - Math.floor(i / 6) * 22 }),
  lounge: (i: number): Pt => [
    { x: 60, y: 560 }, { x: 95, y: 575 }, { x: 140, y: 520 }, { x: 200, y: 590 },
    { x: 240, y: 540 }, { x: 40, y: 610 }, { x: 170, y: 610 }, { x: 260, y: 600 },
  ][i % 8],
  boardFront: (i: number): Pt => ({ x: 820 + (i % 4) * 30, y: 230 + Math.floor(i / 4) * 24 }),
  hrDesk: { x: 415, y: 100 },
  /** Chairs round the meeting-room table, for planning meetings. */
  meetingSeat: (i: number): Pt => ({ x: 818 + (i % 4) * 30, y: i < 4 ? 336 : 402 }),
};

// ── Walk network ──────────────────────────────────────────────────────────
// Top corridor (below the top rooms), bottom corridor (above the bottom rooms),
// and a centre aisle joining them. Desk rows are walked along the lane just
// behind the desks, so people pass *behind* their colleagues, never over desks.
export const TOP_CORRIDOR_Y = TOP + 20;
export const BOTTOM_CORRIDOR_Y = BOTTOM - 16;
export const AISLE_X = 421;

export function roomAt(p: Pt): Room {
  return ROOMS.find((r) => r.id !== "floor" && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) ?? roomById.floor;
}

/** Steps from a point out to the centre aisle (last element is on the aisle). */
function accessPath(p: Pt): Pt[] {
  const room = roomAt(p);
  if (room.id === "floor") return [{ x: AISLE_X, y: p.y }];
  if (room.id === "meeting") return [room.door, { x: AISLE_X, y: room.door.y }];
  const corridorY = room.y < TOP ? TOP_CORRIDOR_Y : BOTTOM_CORRIDOR_Y;
  return [room.door, { x: room.door.x, y: corridorY }, { x: AISLE_X, y: corridorY }];
}

export function routeBetween(from: Pt, to: Pt): Pt[] {
  const a = roomAt(from);
  const b = roomAt(to);
  if (a.id === b.id && a.id !== "floor") return [to];
  if (a.id === "floor" && b.id === "floor" && Math.abs(from.y - to.y) < 4) return [to];
  return [...accessPath(from), ...accessPath(to).reverse(), to];
}
