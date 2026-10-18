import { useEffect, useMemo, useState } from "react";
import type { Company } from "../api/types";
import {
  useAdapters,
  useCompanySkills,
  useOrg,
  useProjects,
  useRoutines,
  useSecrets,
  useToolConnections,
} from "../api/hooks";
import { useOffice, type BasementRoomId } from "../state/officeStore";
import { PixelSprite, useWalker, useWalkFrame } from "../pixel/Character";
import type { Appearance } from "../pixel/sprite";
import { Bookshelf, Plant, ServerRack } from "./Furniture";
import { WORLD_H, WORLD_W } from "./layout";
import { buttonProps } from "./a11y";

interface B1Room {
  id: BasementRoomId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
}

const ROW_H = 250;
const CORRIDOR_Y0 = ROW_H;
const CORRIDOR_Y1 = 390;
const COL_W = WORLD_W / 4;

export const B1_ROOMS: B1Room[] = [
  { id: "settings", label: "MANAGEMENT", x: 0, y: 0, w: COL_W, h: ROW_H, floor: "#b8a88a" },
  { id: "org", label: "ORG CHART GALLERY", x: COL_W, y: 0, w: COL_W, h: ROW_H, floor: "#a89aa8" },
  { id: "skills", label: "TRAINING LIBRARY", x: COL_W * 2, y: 0, w: COL_W, h: ROW_H, floor: "#9aa88a" },
  { id: "routines", label: "SCHEDULING ROOM", x: COL_W * 3, y: 0, w: COL_W, h: ROW_H, floor: "#a8a898" },
  { id: "projects", label: "WORKSHOP · PROJECTS", x: 0, y: CORRIDOR_Y1, w: COL_W, h: WORLD_H - CORRIDOR_Y1, floor: "#a8927a" },
  { id: "tools", label: "SWITCHBOARD · TOOLS", x: COL_W, y: CORRIDOR_Y1, w: COL_W, h: WORLD_H - CORRIDOR_Y1, floor: "#8a98a8" },
  { id: "vault", label: "VAULT · SECRETS", x: COL_W * 2, y: CORRIDOR_Y1, w: COL_W, h: WORLD_H - CORRIDOR_Y1, floor: "#8a8a92" },
  { id: "adapters", label: "GENERATOR · ADAPTERS", x: COL_W * 3, y: CORRIDOR_Y1, w: COL_W, h: WORLD_H - CORRIDOR_Y1, floor: "#7a8078" },
];

function useFrame(ms: number) {
  const [f, setF] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setF((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return f;
}

export function BasementScene({ company }: { company: Company }) {
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const frame = useFrame(900);

  return (
    <svg className="office-svg" viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Basement floor B1">
      <defs>
        {B1_ROOMS.map((r) => (
          <pattern key={r.id} id={`b1-${r.id}`} width={16} height={16} patternUnits="userSpaceOnUse">
            <rect width={16} height={16} fill={r.floor} />
            <rect width={8} height={8} fill="#000" opacity={0.05} />
            <rect x={8} y={8} width={8} height={8} fill="#000" opacity={0.05} />
          </pattern>
        ))}
        <pattern id="b1-corridor" width={32} height={16} patternUnits="userSpaceOnUse">
          <rect width={32} height={16} fill="#6a6a72" />
          <rect width={31} height={15} fill="#74747c" />
        </pattern>
      </defs>

      <rect x={0} y={CORRIDOR_Y0} width={WORLD_W} height={CORRIDOR_Y1 - CORRIDOR_Y0} fill="url(#b1-corridor)" />
      {B1_ROOMS.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#b1-${r.id})`} />
      ))}
      <B1Walls />

      {/* Pipes along the corridor ceiling: it's a basement */}
      <g shapeRendering="crispEdges">
        <rect x={0} y={CORRIDOR_Y0 + 6} width={WORLD_W} height={5} fill="#8a6a4a" />
        <rect x={0} y={CORRIDOR_Y0 + 14} width={WORLD_W} height={3} fill="#5a7a8a" />
        {[120, 360, 600, 840].map((x) => (
          <rect key={x} x={x} y={CORRIDOR_Y0 + 4} width={8} height={9} fill="#6a4a2a" />
        ))}
        {frame % 6 === 0 && <rect x={604} y={CORRIDOR_Y0 + 20 + (frame % 3) * 4} width={2} height={3} fill="#9fd4f0" />}
      </g>

      <SettingsDecor company={company} />
      <OrgDecor companyId={company.id} />
      <LibraryDecor companyId={company.id} />
      <CalendarDecor companyId={company.id} />
      <WorkshopDecor companyId={company.id} />
      <SwitchboardDecor companyId={company.id} frame={frame} />
      <VaultDecor companyId={company.id} frame={frame} />
      <GeneratorDecor frame={frame} />

      {/* Stairs back up */}
      <g>
        <rect
          x={14}
          y={CORRIDOR_Y0 + 26}
          width={110}
          height={100}
          fill="transparent"
          className="room-hit"
          {...buttonProps("Stairs up to the ground floor", () => goFloor("ground"))}
        />
        <g shapeRendering="crispEdges" pointerEvents="none" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={20 + i * 14} y={CORRIDOR_Y0 + 110 - i * 14} width={100 - i * 14} height={12} fill={i % 2 ? "#5a5a66" : "#6a6a76"} />
          ))}
          <rect x={20} y={CORRIDOR_Y0 + 32} width={74} height={14} fill="rgba(25,20,30,0.85)" />
          <text x={26} y={CORRIDOR_Y0 + 42} fontFamily="'Press Start 2P'" fontSize={6} fill="#F5C542">▲ GROUND</text>
        </g>
      </g>
      <Plant x={930} y={CORRIDOR_Y0 + 100} />

      <Janitor />

      {B1_ROOMS.map((r) => (
        <g key={r.id}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="transparent"
            className="room-hit"
            {...buttonProps(r.label, () => open({ kind: "room", room: r.id }))}
          />
          <g transform={`translate(${r.x + 8}, ${r.y < ROW_H ? r.y + r.h - 16 : r.y + 8})`} shapeRendering="crispEdges" pointerEvents="none" aria-hidden="true">
            <rect width={r.label.length * 6 + 10} height={12} fill="rgba(25,20,30,0.82)" />
            <text x={5} y={9} fontFamily="'Press Start 2P'" fontSize={6} fill="#f5e6c8">{r.label}</text>
          </g>
        </g>
      ))}
      <g transform={`translate(${WORLD_W - 70}, ${CORRIDOR_Y0 + 30})`} shapeRendering="crispEdges">
        <rect width={56} height={16} fill="#2a2a3a" />
        <text x={28} y={11} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={7} fill="#F5C542">B1</text>
      </g>
    </svg>
  );
}

function B1Walls() {
  const wall = "#4a3e36";
  const t = 6;
  const door = 34;
  const segs: React.ReactElement[] = [];
  for (const y of [CORRIDOR_Y0, CORRIDOR_Y1]) {
    for (let c = 0; c < 4; c++) {
      const mid = c * COL_W + COL_W / 2;
      segs.push(<rect key={`${y}a${c}`} x={c * COL_W} y={y - t / 2} width={mid - door / 2 - c * COL_W} height={t} fill={wall} />);
      segs.push(<rect key={`${y}b${c}`} x={mid + door / 2} y={y - t / 2} width={(c + 1) * COL_W - mid - door / 2} height={t} fill={wall} />);
    }
  }
  for (let c = 1; c < 4; c++) {
    segs.push(<rect key={`vt${c}`} x={c * COL_W - t / 2} y={0} width={t} height={CORRIDOR_Y0} fill={wall} />);
    segs.push(<rect key={`vb${c}`} x={c * COL_W - t / 2} y={CORRIDOR_Y1} width={t} height={WORLD_H - CORRIDOR_Y1} fill={wall} />);
  }
  segs.push(<rect key="frame" x={1} y={1} width={WORLD_W - 2} height={WORLD_H - 2} fill="none" stroke="#2a2018" strokeWidth={4} />);
  return <g shapeRendering="crispEdges">{segs}</g>;
}

function SettingsDecor({ company }: { company: Company }) {
  const paused = (company as { status?: string }).status === "paused";
  return (
    <g shapeRendering="crispEdges">
      <rect x={30} y={30} width={60} height={34} fill="#2a2a3a" />
      <rect x={33} y={33} width={54} height={28} fill={paused ? "#5a2a2a" : "#2a5a3a"} />
      <text x={60} y={51} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#fff">{paused ? "PAUSED" : "OPEN"}</text>
      <rect x={110} y={120} width={100} height={26} fill="#6a4a2a" />
      <rect x={110} y={120} width={100} height={4} fill="#8a6a4a" />
      <rect x={150} y={108} width={20} height={14} fill="#2a2a32" />
      <rect x={180} y={30} width={30} height={60} fill="#7a8a9a" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={183} y={34 + i * 14} width={24} height={10} fill="#9aaaba" />)}
      <rect x={30} y={90} width={60} height={8} fill="#c8b8a0" />
      <text x={60} y={96} textAnchor="middle" fontFamily="VT323" fontSize={8} fill="#3a2a1a">{company.issuePrefix}</text>
    </g>
  );
}

function OrgDecor({ companyId }: { companyId: string }) {
  const { data } = useOrg(companyId);
  // Flatten into up to three levels for the framed chart on the wall.
  const levels = useMemo(() => {
    const out: number[] = [];
    const walk = (nodes: { reports: unknown[] }[], depth: number) => {
      if (depth > 2 || !nodes.length) return;
      out[depth] = (out[depth] ?? 0) + nodes.length;
      for (const n of nodes) walk(n.reports as { reports: unknown[] }[], depth + 1);
    };
    walk(data ?? [], 0);
    return out;
  }, [data]);
  const x0 = COL_W + 30;
  return (
    <g shapeRendering="crispEdges">
      <rect x={x0} y={24} width={180} height={130} fill="#6a4a2a" />
      <rect x={x0 + 6} y={30} width={168} height={118} fill="#fafaf0" />
      {levels.map((n, depth) => {
        const count = Math.min(n, 6);
        const gap = 168 / (count + 1);
        return Array.from({ length: count }, (_, i) => (
          <g key={`${depth}-${i}`}>
            <rect x={x0 + 6 + gap * (i + 1) - 10} y={40 + depth * 36} width={20} height={14} fill={depth === 0 ? "#E24B4A" : depth === 1 ? "#378ADD" : "#1D9E75"} />
            {depth > 0 && <rect x={x0 + 6 + gap * (i + 1) - 1} y={40 + depth * 36 - 12} width={2} height={12} fill="#888" />}
          </g>
        ));
      })}
      {levels.length === 0 && (
        <text x={x0 + 90} y={92} textAnchor="middle" fontFamily="VT323" fontSize={12} fill="#888">no staff yet</text>
      )}
      <rect x={x0 + 40} y={180} width={100} height={14} fill="#7a5a3a" />
    </g>
  );
}

function LibraryDecor({ companyId }: { companyId: string }) {
  const { data } = useCompanySkills(companyId);
  const shelves = Math.max(2, Math.min(4, Math.ceil((data?.length ?? 0) / 8)));
  const x0 = COL_W * 2 + 20;
  return (
    <g>
      {Array.from({ length: shelves }, (_, i) => (
        <Bookshelf key={i} x={x0 + (i % 4) * 48} y={24} />
      ))}
      <g shapeRendering="crispEdges">
        <rect x={x0 + 40} y={120} width={120} height={30} fill="#8a6a4a" />
        <rect x={x0 + 40} y={120} width={120} height={4} fill="#a0805a" />
        <rect x={x0 + 70} y={112} width={22} height={10} fill="#f0e8d0" />
        <rect x={x0 + 110} y={112} width={22} height={10} fill="#d0e8f0" />
        <text x={x0 + 100} y={176} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#2a3a1a">
          {data?.length ?? 0} SKILLS
        </text>
      </g>
    </g>
  );
}

function CalendarDecor({ companyId }: { companyId: string }) {
  const { data } = useRoutines(companyId);
  const active = (data ?? []).filter((r) => r.status === "active").length;
  const x0 = COL_W * 3 + 30;
  return (
    <g shapeRendering="crispEdges">
      <rect x={x0} y={24} width={150} height={110} fill="#fafaf0" />
      <rect x={x0} y={24} width={150} height={16} fill="#E24B4A" />
      <text x={x0 + 75} y={36} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#fff">
        {new Date().toLocaleString("en", { month: "short" }).toUpperCase()}
      </text>
      {Array.from({ length: 28 }, (_, i) => (
        <rect
          key={i}
          x={x0 + 6 + (i % 7) * 20}
          y={46 + Math.floor(i / 7) * 21}
          width={17}
          height={17}
          fill={i < active * 4 && i % 4 === 0 ? "#F5C542" : "#e8e8e0"}
        />
      ))}
      <rect x={x0 + 150 + 10} y={60} width={16} height={16} fill="#fff" stroke="#333" />
      <rect x={x0 + 167} y={64} width={1} height={5} fill="#333" />
      <rect x={x0 + 167} y={68} width={4} height={1} fill="#333" />
      <text x={x0 + 75} y={176} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#3a3a2a">{active} ROUTINES</text>
    </g>
  );
}

function WorkshopDecor({ companyId }: { companyId: string }) {
  const { data } = useProjects(companyId);
  const projects = (data ?? []).filter((p) => !p.archivedAt).slice(0, 6);
  return (
    <g shapeRendering="crispEdges">
      <rect x={20} y={CORRIDOR_Y1 + 40} width={180} height={34} fill="#7a5a3a" />
      <rect x={20} y={CORRIDOR_Y1 + 40} width={180} height={5} fill="#9a7a5a" />
      {projects.map((p, i) => (
        <g key={p.id}>
          <rect x={28 + i * 28} y={CORRIDOR_Y1 + 26} width={22} height={16} fill={["#F5C542", "#8FD3FF", "#9BE59B", "#C9A7FF", "#FF8A8A", "#ffb36b"][i]} />
          <rect x={28 + i * 28} y={CORRIDOR_Y1 + 24} width={10} height={4} fill={["#d0a020", "#5aa0d0", "#5ab05a", "#9a7ad0", "#d05a5a", "#d08a3a"][i]} />
        </g>
      ))}
      <rect x={30} y={CORRIDOR_Y1 + 120} width={40} height={50} fill="#5a5a66" />
      {[0, 1, 2].map((i) => <rect key={i} x={34} y={CORRIDOR_Y1 + 126 + i * 15} width={32} height={10} fill="#7a7a86" />)}
      <rect x={150} y={CORRIDOR_Y1 + 140} width={40} height={6} fill="#aaa" />
      <rect x={166} y={CORRIDOR_Y1 + 128} width={8} height={14} fill="#c0392b" />
      <text x={120} y={CORRIDOR_Y1 + 100} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#3a2a1a">
        {projects.length} PROJECTS
      </text>
    </g>
  );
}

function SwitchboardDecor({ companyId, frame }: { companyId: string; frame: number }) {
  const { data } = useToolConnections(companyId);
  const conns = data ?? [];
  const x0 = COL_W + 30;
  const y0 = CORRIDOR_Y1 + 34;
  return (
    <g shapeRendering="crispEdges">
      <rect x={x0} y={y0} width={180} height={100} fill="#4a3a2a" />
      <rect x={x0 + 6} y={y0 + 6} width={168} height={88} fill="#2a2a2a" />
      {Array.from({ length: 24 }, (_, i) => {
        const c = conns[i];
        const color = !c ? "#3a3a3a" : !c.enabled ? "#5a5a5a" : c.healthStatus === "ok" ? ((frame + i) % 5 === 0 ? "#2a8a2a" : "#4ae04a") : "#E24B4A";
        return (
          <g key={i}>
            <rect x={x0 + 14 + (i % 8) * 20} y={y0 + 14 + Math.floor(i / 8) * 26} width={8} height={8} fill={color} />
            <rect x={x0 + 16 + (i % 8) * 20} y={y0 + 24 + Math.floor(i / 8) * 26} width={4} height={6} fill="#111" />
          </g>
        );
      })}
      <path d={`M${x0 + 18} ${y0 + 30} q 40 40 80 0`} stroke="#c0392b" strokeWidth={2} fill="none" />
      <text x={x0 + 90} y={y0 + 124} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#1a2a3a">{conns.length} LINES</text>
    </g>
  );
}

function VaultDecor({ companyId, frame }: { companyId: string; frame: number }) {
  const { data } = useSecrets(companyId);
  const cx = COL_W * 2 + COL_W / 2;
  const cy = CORRIDOR_Y1 + 110;
  return (
    <g shapeRendering="crispEdges">
      <rect x={cx - 62} y={cy - 62} width={124} height={124} fill="#5a5a62" />
      <circle cx={cx} cy={cy} r={52} fill="#8a8a96" stroke="#3a3a42" strokeWidth={6} shapeRendering="auto" />
      <circle cx={cx} cy={cy} r={16} fill="#5a5a62" shapeRendering="auto" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + frame * 0.05;
        return <rect key={i} x={cx + Math.cos(a) * 30 - 3} y={cy + Math.sin(a) * 30 - 3} width={6} height={6} fill="#3a3a42" />;
      })}
      <rect x={cx + 54} y={cy - 6} width={10} height={12} fill="#c8a030" />
      <text x={cx} y={cy + 80} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#1a1a2a">
        {data?.length ?? 0} SECRETS
      </text>
    </g>
  );
}

function GeneratorDecor({ frame }: { frame: number }) {
  const { data } = useAdapters();
  const adapters = (data ?? []).slice(0, 8);
  const x0 = COL_W * 3 + 18;
  return (
    <g>
      {adapters.map((a, i) => (
        <g key={a.type}>
          <ServerRack x={x0 + (i % 4) * 50} y={CORRIDOR_Y1 + 30 + Math.floor(i / 4) * 92} blink={frame + i} off={a.disabled} />
          <rect x={x0 + (i % 4) * 50} y={CORRIDOR_Y1 + 84 + Math.floor(i / 4) * 92} width={26} height={9} fill={a.disabled ? "#7a2a2a" : "#1a3a1a"} />
          <text x={x0 + (i % 4) * 50 + 13} y={CORRIDOR_Y1 + 91 + Math.floor(i / 4) * 92} textAnchor="middle" fontFamily="VT323" fontSize={7} fill="#fff">
            {a.type.replace(/_local|_gateway|-local/, "").slice(0, 7)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A maintenance worker pacing the corridor, so the floor never feels dead. */
function Janitor() {
  const appearance = useMemo<Appearance>(() => ({ hair: "#4a3a2a", hairStyle: "hard-hat", clothes: "#5a7a8a", skin: "#E0AC69", build: "a" }), []);
  const [targetX, setTargetX] = useState(300);
  useEffect(() => {
    const id = setInterval(() => setTargetX(160 + Math.round(Math.random() * 600)), 7000);
    return () => clearInterval(id);
  }, []);
  const { pos, moving, dir } = useWalker({ x: targetX, y: 340 }, { x: 300, y: 340 });
  const frame = useWalkFrame(moving);
  return (
    <g transform={`translate(${Math.round(pos.x)},${Math.round(pos.y)})`} pointerEvents="none">
      <ellipse cx={0} cy={1} rx={10} ry={3} fill="rgba(0,0,0,0.2)" />
      <PixelSprite appearance={appearance} expression="normal" moving={moving} frame={frame} flip={dir === "left"} />
      {!moving && (
        <g shapeRendering="crispEdges" transform="translate(12,-14)">
          <rect width={3} height={16} fill="#8a6a4a" />
          <rect x={-3} y={14} width={9} height={4} fill="#c8c8d0" />
        </g>
      )}
    </g>
  );
}
