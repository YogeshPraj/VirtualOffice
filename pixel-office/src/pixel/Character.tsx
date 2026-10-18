import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  baseSprite,
  GRID_H,
  GRID_W,
  toStrips,
  walkFrame,
  withExpression,
  type Appearance,
  type Expression,
} from "./sprite";
import { routeBetween, type Pt } from "../office/layout";

const PX = 2;
const WALK_SPEED = 90; // world px per second

/** Walks along the corridor network whenever `target` changes. */
export function useWalker(target: Pt, initial: Pt) {
  const [pos, setPos] = useState<Pt>(initial);
  const [moving, setMoving] = useState(false);
  const [dir, setDir] = useState<"left" | "right">("right");
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = posRef.current;
    if (Math.hypot(start.x - target.x, start.y - target.y) < 1) {
      setMoving(false);
      return;
    }
    if (reduced) {
      setPos(target);
      setMoving(false);
      return;
    }
    const path = routeBetween(start, target);
    let seg = 0;
    let last = performance.now();
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    setMoving(true);

    // rAF stalls in background tabs and some embedded webviews; a timer fallback
    // guarantees progress, whichever fires first drives the frame.
    const schedule = () => {
      let fired = false;
      const run = () => {
        if (fired || cancelled) return;
        fired = true;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        step(performance.now());
      };
      raf = requestAnimationFrame(run);
      timer = setTimeout(run, 50);
    };

    const step = (t: number) => {
      const elapsed = (t - last) / 1000;
      last = t;
      // After a long stall (tab hidden for a while) just arrive instead of crawling.
      let budget = elapsed > 3 ? Number.POSITIVE_INFINITY : WALK_SPEED * Math.min(0.25, elapsed);
      let cur = posRef.current;
      while (budget > 0 && seg < path.length) {
        const to = path[seg];
        const dx = to.x - cur.x;
        const dy = to.y - cur.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) setDir(dx < 0 ? "left" : "right");
        if (d <= budget) {
          cur = to;
          seg++;
          budget -= d;
        } else {
          cur = { x: cur.x + (dx / d) * budget, y: cur.y + (dy / d) * budget };
          budget = 0;
        }
      }
      posRef.current = cur;
      setPos(cur);
      if (seg < path.length) schedule();
      else setMoving(false);
    };
    schedule();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [target.x, target.y]);

  return { pos, moving, dir };
}

function useTicker(ms: number, enabled = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return tick;
}

export const PixelSprite = memo(function PixelSprite({
  appearance,
  expression,
  moving,
  frame,
  flip,
  back,
}: {
  appearance: Appearance;
  expression: Expression;
  moving: boolean;
  frame: number;
  flip: boolean;
  back?: boolean;
}) {
  const strips = useMemo(() => {
    const base = baseSprite(appearance);
    let grid = moving ? walkFrame(base, appearance, frame % 2 === 0 ? 1 : 2) : base;
    if (back) {
      // Seen from behind: hair covers the face rows.
      grid = grid.map((row, y) =>
        y >= 4 && y <= 9 ? row.map((c) => (c ? (y <= 8 ? appearance.hair : c) : c)) : row,
      );
    } else {
      grid = withExpression(grid, expression, appearance.skin);
    }
    return toStrips(grid, flip);
  }, [appearance, expression, moving, frame, flip, back]);

  return (
    <g transform={`translate(${(-GRID_W * PX) / 2}, ${-GRID_H * PX})`} shapeRendering="crispEdges">
      {strips.map((s, i) => (
        <rect key={i} x={s.x * PX} y={s.y * PX} width={s.w * PX} height={PX} fill={s.c} />
      ))}
    </g>
  );
});

export type Indicator = "typing" | "error" | "sleeping" | "asking" | "waiting" | "coffee" | "board" | null;

/** Small pixel icon floating above the head. */
export function StatusIcon({ kind }: { kind: Indicator }) {
  const tick = useTicker(450, kind !== null);
  if (!kind) return null;
  const bob = tick % 2 === 0 ? 0 : -2;
  const y = -GRID_H * PX - 14 + bob;
  switch (kind) {
    case "typing":
      return (
        <g transform={`translate(-9, ${y + 2})`} shapeRendering="crispEdges">
          <rect x={-2} y={-2} width={22} height={10} fill="#fff" stroke="#222" strokeWidth={1} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={2 + i * 6} y={2} width={3} height={3} fill={tick % 3 === i ? "#222" : "#aaa"} />
          ))}
        </g>
      );
    case "error":
      return (
        <g transform={`translate(-5, ${y - 4})`} shapeRendering="crispEdges">
          <rect width={10} height={14} fill="#E24B4A" stroke="#5a1010" />
          <rect x={4} y={2} width={2} height={6} fill="#fff" />
          <rect x={4} y={10} width={2} height={2} fill="#fff" />
        </g>
      );
    case "asking":
      return (
        <g transform={`translate(-6, ${y - 4})`} shapeRendering="crispEdges">
          <rect width={12} height={14} fill="#F5C542" stroke="#6a4a00" />
          <rect x={3} y={2} width={6} height={2} fill="#3a2a00" />
          <rect x={7} y={4} width={2} height={3} fill="#3a2a00" />
          <rect x={5} y={7} width={2} height={2} fill="#3a2a00" />
          <rect x={5} y={10} width={2} height={2} fill="#3a2a00" />
        </g>
      );
    case "waiting":
      return (
        <g transform={`translate(-6, ${y - 2})`} shapeRendering="crispEdges">
          <rect width={12} height={12} fill="#fff" stroke="#333" />
          <rect x={2} y={3} width={8} height={1} fill="#555" />
          <rect x={2} y={6} width={8} height={1} fill="#555" />
          <rect x={2} y={9} width={5} height={1} fill="#555" />
        </g>
      );
    case "sleeping":
      return (
        <text x={6} y={y + 6 + bob} fontFamily="'Press Start 2P'" fontSize={7} fill="#4a6aaa">
          {tick % 3 === 0 ? "z" : tick % 3 === 1 ? "zZ" : "zZz"}
        </text>
      );
    case "coffee":
      return (
        <g transform={`translate(8, ${-GRID_H * PX + 18})`} shapeRendering="crispEdges">
          <rect width={6} height={6} fill="#fff" stroke="#6a4a2a" />
          <rect x={6} y={1} width={2} height={3} fill="#6a4a2a" />
          {tick % 2 === 0 && <rect x={2} y={-4} width={1} height={3} fill="#ccc" />}
        </g>
      );
    case "board":
      return null;
  }
}

export function SpeechBubble({ text }: { text: string }) {
  const clipped = text.length > 46 ? `${text.slice(0, 44)}…` : text;
  const lines = wrap(clipped, 23);
  const w = Math.max(...lines.map((l) => l.length)) * 5.2 + 12;
  const h = lines.length * 10 + 8;
  return (
    <g transform={`translate(${-w / 2}, ${-GRID_H * PX - 18 - h})`} shapeRendering="crispEdges" pointerEvents="none">
      <rect width={w} height={h} fill="#fffef5" stroke="#222" strokeWidth={1.5} />
      <rect x={w / 2 - 3} y={h} width={6} height={4} fill="#fffef5" />
      <rect x={w / 2 - 1} y={h + 4} width={2} height={2} fill="#222" />
      {lines.map((l, i) => (
        <text key={i} x={6} y={13 + i * 10} fontFamily="VT323" fontSize={11} fill="#222">
          {l}
        </text>
      ))}
    </g>
  );
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function useWalkFrame(moving: boolean) {
  return useTicker(180, moving);
}
