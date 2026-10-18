import { useMemo } from "react";
import type { Agent } from "../api/types";
import { appearanceFor, baseSprite, GRID_H, GRID_W, toStrips, type Appearance } from "../pixel/sprite";

export const YOU_APPEARANCE: Appearance = { hair: "#1a1a1a", hairStyle: "neat", clothes: "#2a2a3a", skin: "#C68642", build: "a" };

/** Standalone pixel portrait for panels and chat. */
export function Avatar({ agent, appearance, size = 32 }: { agent?: Agent; appearance?: Appearance; size?: number }) {
  const look = appearance ?? (agent ? appearanceFor(agent.id, agent.role) : YOU_APPEARANCE);
  const strips = useMemo(() => toStrips(baseSprite(look)), [look]);
  return (
    <svg
      width={size}
      height={(size * GRID_H) / GRID_W}
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      shapeRendering="crispEdges"
      className="avatar"
      aria-hidden
    >
      {strips.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={s.w} height={1} fill={s.c} />
      ))}
    </svg>
  );
}
