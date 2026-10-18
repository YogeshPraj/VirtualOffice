// Pixel character sprites.
// Base templates, walk frames and expressions are ported from agent-virtual-office
// (https://github.com/KbWen/agent-virtual-office, MIT © 2026 KbWen — see
// THIRD_PARTY_LICENSE_agent-virtual-office.txt). Extended here with skin tones and
// deterministic per-agent appearance so any number of hires get a distinct look.

import type { AgentRole } from "../api/types";

export const GRID_W = 16;
export const GRID_H = 20;

export type Grid = (string | null)[][];
export type HairStyle = "neat" | "spiky" | "bangs" | "long" | "twin-tails" | "beret" | "hard-hat";
export type Build = "a" | "b";
export type Expression = "normal" | "happy" | "sleepy" | "focused" | "surprised" | "tired" | "confused";

export interface Appearance {
  hair: string;
  hairStyle: HairStyle;
  clothes: string;
  skin: string;
  build: Build;
}

const PANTS = "#3a3a5a";
const SHOES = "#2a2a3a";
const EYE = "#1a1a2a";
const WHITE = "#FFFFFF";
const MOUTH = "#C08060";
const BLUSH = "#FFB6C1";
const LIPS = "#F08080";

const SKIN_TONES = ["#FFE0C0", "#F1C27D", "#E0AC69", "#C68642", "#8D5524"];
const HAIR_COLORS = ["#3a2a1a", "#1a1a1a", "#5a4a3a", "#8a5a2a", "#c8a050", "#a03a2a", "#4a1a2a", "#2a5a3a", "#5a4a8a", "#3a7a6a", "#e8e8e8"];
const FREE_STYLES: HairStyle[] = ["neat", "spiky", "bangs", "long", "twin-tails"];

/** Shirt colour per role so teams read at a glance. */
export const ROLE_COLORS: Record<AgentRole, string> = {
  ceo: "#E24B4A",
  cto: "#7F77DD",
  cmo: "#E8688A",
  cfo: "#C8A030",
  security: "#4a4a5a",
  engineer: "#1D9E75",
  designer: "#E8688A",
  pm: "#378ADD",
  qa: "#BA7517",
  devops: "#D85A30",
  researcher: "#5DCAA5",
  general: "#6a8aa0",
};

const ROLE_HEADWEAR: Partial<Record<AgentRole, HairStyle>> = {
  devops: "hard-hat",
  cto: "beret",
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable look for an agent: same id → same character, every session. */
export function appearanceFor(agentId: string, role: AgentRole): Appearance {
  const h = hash(agentId);
  const pick = <T,>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length];
  return {
    hair: pick(HAIR_COLORS, 0),
    hairStyle: ROLE_HEADWEAR[role] ?? pick(FREE_STYLES, 5),
    clothes: ROLE_COLORS[role] ?? ROLE_COLORS.general,
    skin: pick(SKIN_TONES, 11),
    build: (h >>> 17) % 2 === 0 ? "a" : "b",
  };
}

const darkenCache = new Map<string, string>();
export function darken(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const key = `${hex}:${amount}`;
  const hit = darkenCache.get(key);
  if (hit) return hit;
  const ch = (i: number) => Math.max(0, parseInt(hex.slice(i, i + 2), 16) - amount).toString(16).padStart(2, "0");
  const out = `#${ch(1)}${ch(3)}${ch(5)}`;
  darkenCache.set(key, out);
  return out;
}

function setPixels(grid: Grid, row: number, pixels: (string | undefined)[]) {
  for (let i = 0; i < pixels.length; i++) if (pixels[i] != null) grid[row][i] = pixels[i]!;
}
function clearRow(grid: Grid, row: number) {
  grid[row].fill(null);
}
const empty = (): Grid => Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
const _ = undefined;

export function baseSprite(a: Appearance): Grid {
  const grid = empty();
  const hc = a.hair;
  const hd = darken(a.hair, 30);
  const b = a.build;

  switch (a.hairStyle) {
    case "twin-tails":
      setPixels(grid, 0, [_, _, _, _, _, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 1, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 2, [_, hc, hc, _, hc, hd, hc, hc, hc, hd, hc, _, hc, hc]);
      setPixels(grid, 3, [_, hc, hc, hc, hc, hc, hc, hc, hc, hc, hc, hc, hc, hc]);
      if (b === "b") {
        setPixels(grid, 4, [hc, hc, _, _, _, _, _, _, _, _, _, _, _, _, hc, hc]);
        setPixels(grid, 5, [hc, hc, _, _, _, _, _, _, _, _, _, _, _, _, hc, hc]);
      }
      break;
    case "hard-hat": {
      const hat = "#F5A623";
      const hatD = "#E09520";
      setPixels(grid, 0, [_, _, _, _, _, hat, hat, hat, hat, hat, hat]);
      setPixels(grid, 1, [_, _, _, _, hat, hat, hat, hat, hat, hat, hat]);
      setPixels(grid, 2, [_, _, _, hat, hat, hat, hat, hat, hat, hat, hat, hat]);
      setPixels(grid, 3, [_, _, hatD, hatD, hatD, hatD, hatD, hatD, hatD, hatD, hatD, hatD, hatD]);
      break;
    }
    case "beret": {
      const beret = "#6a5aaa";
      setPixels(grid, 0, [_, _, _, _, beret, beret, beret, beret, beret, beret, beret]);
      setPixels(grid, 1, [_, _, _, beret, beret, beret, beret, beret, beret, beret, beret, beret]);
      setPixels(grid, 2, [_, _, _, beret, beret, hc, hc, hc, hc, hc, hc, beret]);
      setPixels(grid, 3, [_, _, _, _, hc, hc, hd, hc, hc, hd, hc, hc]);
      break;
    }
    case "long":
      setPixels(grid, 0, [_, _, _, _, _, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 1, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 2, [_, _, _, hc, hc, hd, hc, hc, hc, hd, hc, hc]);
      setPixels(grid, 3, [_, _, _, hc, hc, hc, hc, hc, hc, hc, hc, hc]);
      for (const r of [4, 5, 6]) setPixels(grid, r, [_, _, _, hc, _, _, _, _, _, _, _, _, hc]);
      break;
    case "bangs":
      setPixels(grid, 0, [_, _, _, _, _, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 1, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 2, [_, _, _, _, hc, hd, hc, hd, hc, hd, hc]);
      setPixels(grid, 3, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      if (b === "b") {
        setPixels(grid, 4, [_, _, _, hc, _, _, _, _, _, _, _, _, hc]);
        setPixels(grid, 5, [_, _, _, hc]);
      }
      break;
    case "spiky":
      setPixels(grid, 0, [_, _, _, _, hc, _, _, hc, _, _, hc]);
      setPixels(grid, 1, [_, _, _, hc, hc, hc, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 2, [_, _, _, _, hc, hd, hc, hc, hc, hd, hc]);
      setPixels(grid, 3, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      break;
    default:
      setPixels(grid, 0, [_, _, _, _, _, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 1, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
      setPixels(grid, 2, [_, _, _, _, hc, hd, hc, hc, hc, hd, hc]);
      setPixels(grid, 3, [_, _, _, _, hc, hc, hc, hc, hc, hc, hc]);
  }

  // Face
  const sk = a.skin;
  const sd = darken(a.skin, 16);
  setPixels(grid, 4, [_, _, _, _, sk, sk, sk, sk, sk, sk, sk, sk]);
  setPixels(grid, 5, [_, _, _, sk, sk, sk, sk, sk, sk, sk, sk, sk, sk]);
  setPixels(grid, 6, [_, _, _, sk, sk, EYE, WHITE, sk, sk, EYE, WHITE, sk, sk]);
  setPixels(grid, 7, [_, _, _, sk, BLUSH, sk, sk, sk, sk, sk, sk, BLUSH, sk]);
  if (b === "b") {
    setPixels(grid, 5, [_, _, _, _, _, EYE, _, _, _, _, EYE]);
    setPixels(grid, 8, [_, _, _, _, sk, sk, sk, LIPS, sk, sk, sk, sk]);
  } else {
    setPixels(grid, 8, [_, _, _, _, sk, sk, sk, MOUTH, MOUTH, sk, sk, sk]);
  }
  setPixels(grid, 9, [_, _, _, _, _, sd, sk, sk, sk, sk, sd]);

  // Body
  const cc = a.clothes;
  const cd = darken(a.clothes, 25);
  setPixels(grid, 10, [_, _, _, _, _, _, _, sk, sk]);
  if (b === "b") {
    setPixels(grid, 11, [_, _, _, _, _, cc, cc, cc, cc, cc, cc]);
    setPixels(grid, 12, [_, _, _, _, _, cc, cd, cc, cc, cd, cc]);
    setPixels(grid, 13, [_, _, _, _, _, cc, cc, cc, cc, cc, cc]);
    const sc = darken(a.clothes, 10);
    setPixels(grid, 14, [_, _, _, _, sc, sc, sc, sc, sc, sc, sc, sc]);
    setPixels(grid, 15, [_, _, _, sc, sc, sc, sc, sc, sc, sc, sc, sc, sc]);
    setPixels(grid, 16, [_, _, _, _, _, sk, sk, _, _, sk, sk]);
    setPixels(grid, 17, [_, _, _, _, _, SHOES, SHOES, _, _, SHOES, SHOES]);
  } else {
    setPixels(grid, 11, [_, _, _, _, sk, cc, cc, cc, cc, cc, cc, sk]);
    setPixels(grid, 12, [_, _, _, _, sk, cc, cd, cc, cc, cd, cc, sk]);
    setPixels(grid, 13, [_, _, _, _, _, cc, cc, cc, cc, cc, cc]);
    setPixels(grid, 14, [_, _, _, _, _, cc, cc, cc, cc, cc, cc]);
    setPixels(grid, 15, [_, _, _, _, _, _, PANTS, PANTS, PANTS, PANTS]);
    setPixels(grid, 16, [_, _, _, _, _, _, PANTS, _, _, PANTS]);
    setPixels(grid, 17, [_, _, _, _, _, SHOES, SHOES, _, _, SHOES, SHOES]);
  }
  return grid;
}

export function walkFrame(base: Grid, a: Appearance, frame: 1 | 2): Grid {
  const grid = base.map((row) => [...row]);
  if (a.build === "b") {
    clearRow(grid, 16);
    clearRow(grid, 17);
    if (frame === 1) {
      setPixels(grid, 16, [_, _, _, _, a.skin, _, _, _, _, a.skin]);
      setPixels(grid, 17, [_, _, _, SHOES, SHOES, _, _, _, SHOES, SHOES]);
    } else {
      setPixels(grid, 16, [_, _, _, _, _, a.skin, _, _, _, a.skin]);
      setPixels(grid, 17, [_, _, _, _, SHOES, SHOES, _, _, SHOES, SHOES]);
    }
  } else {
    clearRow(grid, 15);
    clearRow(grid, 16);
    clearRow(grid, 17);
    if (frame === 1) {
      setPixels(grid, 15, [_, _, _, _, _, PANTS, PANTS, _, _, _, PANTS]);
      setPixels(grid, 16, [_, _, _, _, SHOES, SHOES, _, _, _, PANTS]);
      setPixels(grid, 17, [_, _, _, _, _, _, _, _, _, SHOES, SHOES]);
    } else {
      setPixels(grid, 15, [_, _, _, _, _, PANTS, _, _, _, PANTS, PANTS]);
      setPixels(grid, 16, [_, _, _, _, _, PANTS, _, _, _, SHOES, SHOES]);
      setPixels(grid, 17, [_, _, _, _, _, SHOES, SHOES]);
    }
  }
  return grid;
}

export function withExpression(grid: Grid, expression: Expression, skin: string): Grid {
  if (expression === "normal") return grid;
  const g = grid.map((row) => [...row]);
  switch (expression) {
    case "happy":
      g[5][5] = EYE; g[5][6] = null; g[5][9] = EYE; g[5][10] = null;
      g[6][5] = null; g[6][6] = EYE; g[6][9] = null; g[6][10] = EYE;
      g[8][6] = skin; g[8][7] = LIPS; g[8][8] = LIPS; g[8][9] = skin;
      break;
    case "sleepy":
      g[6][5] = EYE; g[6][6] = EYE; g[6][9] = EYE; g[6][10] = EYE;
      g[8][7] = skin; g[8][8] = skin;
      break;
    case "focused":
      g[6][5] = EYE; g[6][6] = EYE; g[6][9] = EYE; g[6][10] = EYE;
      break;
    case "surprised":
      g[5][5] = EYE; g[5][9] = EYE;
      g[6][5] = EYE; g[6][6] = WHITE; g[6][9] = EYE; g[6][10] = WHITE;
      g[8][7] = LIPS; g[8][8] = LIPS;
      break;
    case "tired":
      g[6][5] = skin; g[6][6] = EYE; g[6][9] = skin; g[6][10] = EYE;
      g[8][7] = MOUTH; g[8][8] = skin;
      break;
    case "confused":
      g[6][5] = EYE; g[6][6] = WHITE; g[6][9] = EYE; g[6][10] = EYE;
      g[8][7] = MOUTH; g[8][8] = MOUTH;
      break;
  }
  return g;
}

/** Run-length encode each row into horizontal strips → far fewer SVG nodes. */
export function toStrips(grid: Grid, flipX = false): { x: number; y: number; w: number; c: string }[] {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = flipX ? [...grid[y]].reverse() : grid[y];
    let x = 0;
    while (x < GRID_W) {
      const c = row[x];
      if (!c) { x++; continue; }
      let w = 1;
      while (x + w < GRID_W && row[x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  }
  return out;
}
