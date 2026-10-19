import { memo, useEffect, useMemo, useRef, useState } from "react";
import { SeasonalDecor } from "./SeasonalDecor";
import { OfficeCat } from "./OfficeCat";
import { useProviderName } from "../api/hooks";
import { createPortal } from "react-dom";
import { buttonProps } from "./a11y";
import type { Agent, AttentionItem, Company, Issue } from "../api/types";
import { useOffice, type RoomId } from "../state/officeStore";
import { appearanceFor, type Appearance } from "../pixel/sprite";
import { PixelSprite, SpeechBubble, StatusIcon, useWalker, useWalkFrame } from "../pixel/Character";
import { decideBehavior, type Behavior } from "./behavior";
import { DESK_CAPACITY, ROOMS, SPOTS, WORLD_H, WORLD_W, deskSlots, roomById, type DeskSlot } from "./layout";
import {
  Bookshelf,
  CoffeeMachine,
  Desk,
  Monitors,
  Phone,
  Plant,
  Safe,
  ServerRack,
  Sofa,
  Whiteboard,
  Window,
} from "./Furniture";
import { useLiveSpeech } from "./liveSpeech";

const STATUS_NOTE: Record<string, string> = {
  backlog: "#d0d0d0",
  todo: "#FFE27A",
  in_progress: "#8FD3FF",
  in_review: "#C9A7FF",
  blocked: "#FF8A8A",
  done: "#9BE59B",
};

function useClock(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** agentId → speech text: a comment they just posted, else what they're doing in their live run. */
function useBubbles() {
  const events = useOffice((s) => s.events);
  const live = useLiveSpeech();
  const now = useClock(1000);
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of events) {
      if (now - new Date(e.createdAt).getTime() > 9000) break;
      const p = e.payload as Record<string, unknown>;
      if (e.type !== "activity.logged" || p.action !== "issue.comment_added" || p.actorType !== "agent") continue;
      const snippet = (p.details as Record<string, unknown> | null)?.bodySnippet;
      const agentId = typeof p.agentId === "string" ? p.agentId : (p.actorId as string);
      if (typeof snippet === "string" && agentId && !out[agentId]) out[agentId] = snippet.replace(/[#*_`>]/g, "").trim();
    }
    for (const [agentId, text] of Object.entries(live)) if (!out[agentId]) out[agentId] = text;
    return out;
  }, [events, now, live]);
}

interface Props {
  company: Company;
  agents: Agent[];
  issues: Issue[];
  attention: AttentionItem[];
}

export function OfficeScene({ company, agents, issues, attention }: Props) {
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const enter = (room: RoomId) => (room === "basement" ? goFloor("basement") : open({ kind: "room", room }));
  const lastOutputAt = useOffice((s) => s.lastOutputAt);
  const now = useClock(2000);
  const frame = Math.floor(now / 2000);
  const bubbles = useBubbles();

  const staff = useMemo(
    () => agents.filter((a) => a.status !== "terminated").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [agents],
  );
  const desks = useMemo(() => deskSlots(Math.max(staff.length, 6)), [staff.length]);
  const rowYs = useMemo(() => [...new Set(desks.map((d) => d.seat.y))].sort((a, b) => a - b), [desks]);
  const [layers, setLayers] = useState<(SVGGElement | null)[]>([]);
  // Stable ref callbacks per band (a fresh callback each render would thrash setLayers).
  const layerRefs = useRef(new Map<number, (el: SVGGElement | null) => void>());
  const setLayer = (k: number) => {
    let cb = layerRefs.current.get(k);
    if (!cb) {
      cb = (el) =>
        setLayers((prev) => {
          if (prev[k] === el) return prev;
          const next = [...prev];
          next[k] = el;
          return next;
        });
      layerRefs.current.set(k, cb);
    }
    return cb;
  };

  const askingQueue = useMemo(() => {
    const ids: string[] = [];
    for (const item of attention) {
      const by = item.subject.metadata?.createdByAgentId;
      if (typeof by === "string" && !ids.includes(by)) ids.push(by);
    }
    return ids;
  }, [attention]);
  const lobbyQueue = staff.filter((a) => a.status === "pending_approval").map((a) => a.id);

  const behaviors = staff.map((agent, i) =>
    decideBehavior({
      agent,
      desk: desks[i % DESK_CAPACITY],
      askingIndex: askingQueue.indexOf(agent.id),
      lobbyIndex: lobbyQueue.indexOf(agent.id),
      lastOutputAt: lastOutputAt[agent.id],
      now,
    }),
  );

  const boardNotes = (["todo", "in_progress", "in_review", "done"] as const).map((st) =>
    issues.filter((i) => i.status === st || (st === "todo" && (i.status === "backlog" || i.status === "blocked"))).map((i) => ({
      color: STATUS_NOTE[i.status],
    })),
  );

  return (
    <svg
      className="office-svg"
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`${company.name} office, ground floor`}
    >
      <defs>
        {ROOMS.map((r) => (
          <pattern key={r.id} id={`tile-${r.id}`} width={16} height={16} patternUnits="userSpaceOnUse">
            <rect width={16} height={16} fill={r.floor} />
            <rect width={8} height={8} fill="#000" opacity={0.04} />
            <rect x={8} y={8} width={8} height={8} fill="#000" opacity={0.04} />
          </pattern>
        ))}
      </defs>

      {/* Floors */}
      {ROOMS.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#tile-${r.id})`} />
      ))}

      <Walls />
      <RoomFurniture company={company} frame={frame} attentionCount={attention.length} boardNotes={boardNotes} />
      <SeasonalDecor />

      {/* Room click areas sit below people so agents stay clickable */}
      {ROOMS.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="transparent"
          className={r.id === "floor" ? "room-hit room-hit-floor" : "room-hit"}
          data-tour={r.id === "floor" ? "floor" : undefined}
          {...buttonProps(
            r.id === "ceo" && attention.length ? `${r.label}, ${attention.length} waiting for you` : r.label,
            () => enter(r.id),
          )}
        />
      ))}

      {/* The CEO's bookshelf is the Study: the company's handbook and second brain. */}
      <g className="study-shelf">
        <rect
          x={726}
          y={36}
          width={48}
          height={42}
          fill="transparent"
          className="room-hit"
          {...buttonProps("CEO's Study: handbook and second brain", () => open({ kind: "room", room: "study" }))}
        />
        <text x={750} y={88} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={5} fill="#f5e6c8" pointerEvents="none">
          STUDY
        </text>
      </g>

      {/* Depth bands: people in band k are drawn before desk row k, so a desk hides
          the legs of whoever sits or walks behind it. */}
      {rowYs.map((rowY, k) => (
        <g key={rowY}>
          <g ref={setLayer(k)} />
          {desks.map((d, i) =>
            d.seat.y === rowY ? <DeskWithOwner key={i} slot={d} agent={staff[i]} behavior={behaviors[i]} /> : null,
          )}
        </g>
      ))}
      <g ref={setLayer(rowYs.length)} />
      <OfficeCat desks={desks} busy={desks.map((_, i) => staff[i]?.status === "running")} />

      <CeoCharacter ringing={attention.length > 0} />
      {staff.map((agent, i) => (
        <AgentFigure
          key={agent.id}
          agent={agent}
          behavior={behaviors[i]}
          seat={desks[i % DESK_CAPACITY].seat}
          bubble={bubbles[agent.id]}
          layers={layers}
          rowYs={rowYs}
          onClick={() => open({ kind: "agent", agentId: agent.id })}
        />
      ))}

      {/* Room signs on top */}
      {ROOMS.map((r) => (
        <RoomSign
          key={r.id}
          room={r.id}
          label={r.label}
          badge={r.id === "ceo" ? attention.length : 0}
        />
      ))}
    </svg>
  );
}

function Walls() {
  const wall = "#5a4636";
  const t = 6;
  const doorW = 34;
  const segs: React.ReactElement[] = [];
  // Horizontal walls along y=170 (top rooms) and y=430 (bottom rooms), with door gaps.
  const hWall = (y: number, x0: number, x1: number, doors: number[], key: string) => {
    let cur = x0;
    [...doors].sort((a, b) => a - b).forEach((d, i) => {
      segs.push(<rect key={`${key}${i}`} x={cur} y={y - t / 2} width={Math.max(0, d - doorW / 2 - cur)} height={t} fill={wall} />);
      cur = d + doorW / 2;
    });
    segs.push(<rect key={`${key}end`} x={cur} y={y - t / 2} width={x1 - cur} height={t} fill={wall} />);
  };
  hWall(170, 0, 780, [roomById.lobby.door.x, roomById.hr.door.x, roomById.ceo.door.x], "top");
  hWall(430, 0, 960, [roomById.lounge.door.x, roomById.finance.door.x, roomById.security.door.x, roomById.basement.door.x], "bot");
  // Vertical dividers
  for (const x of [300, 530]) segs.push(<rect key={`vt${x}`} x={x - t / 2} y={0} width={t} height={170} fill={wall} />);
  for (const x of [300, 490, 670]) segs.push(<rect key={`vb${x}`} x={x - t / 2} y={430} width={t} height={210} fill={wall} />);
  // Meeting room wall with a door near the top corridor
  segs.push(<rect key="mt" x={780 - t / 2} y={0} width={t} height={170} fill={wall} />);
  segs.push(<rect key="mb" x={780 - t / 2} y={170 + doorW} width={t} height={430 - 170 - doorW} fill={wall} />);
  // Outer frame
  segs.push(<rect key="frame" x={1} y={1} width={WORLD_W - 2} height={WORLD_H - 2} fill="none" stroke="#3a2a1e" strokeWidth={4} />);
  return <g shapeRendering="crispEdges">{segs}</g>;
}

const RoomFurniture = memo(function RoomFurniture({
  company,
  frame,
  attentionCount,
  boardNotes,
}: {
  company: Company;
  frame: number;
  attentionCount: number;
  boardNotes: { color: string }[][];
}) {
  return (
    <g>
      {/* Lobby: entrance, company sign, sofa, plants */}
      <rect x={14} y={8} width={44} height={8} fill="#3a2a1e" />
      <rect x={18} y={0} width={36} height={10} fill="#7a5a3a" />
      <g shapeRendering="crispEdges">
        <rect x={80} y={14} width={180} height={26} fill="#2a2a3a" />
        <rect x={83} y={17} width={174} height={20} fill="#3a3a5a" />
        <text x={170} y={32} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={9} fill="#F5C542">
          {company.name.toUpperCase().slice(0, 20)}
        </text>
      </g>
      <Sofa x={150} y={70} color="#3a6aa0" w={70} />
      <Plant x={262} y={60} />
      <Plant x={20} y={130} />

      {/* HR: reception desk, filing cabinet, now hiring sign */}
      <g shapeRendering="crispEdges">
        <rect x={370} y={110} width={90} height={18} fill="#8a6a4a" />
        <rect x={370} y={110} width={90} height={3} fill="#a0805a" />
        <rect x={470} y={50} width={24} height={44} fill="#7a8a9a" />
        {[0, 1, 2].map((i) => <rect key={i} x={473} y={54 + i * 14} width={18} height={10} fill="#9aaaba" />)}
        <rect x={320} y={20} width={70} height={22} fill="#1D9E75" />
        <text x={355} y={35} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#fff">NOW HIRING</text>
      </g>
      <Plant x={500} y={130} />

      {/* CEO office: window, big desk, phone, inbox tray */}
      <Window x={580} y={14} w={60} />
      <Window x={660} y={14} w={60} />
      <Bookshelf x={730} y={40} />
      <g shapeRendering="crispEdges">
        <rect x={640} y={96} width={110} height={26} fill="#5a3a22" />
        <rect x={640} y={96} width={110} height={4} fill="#7a5232" />
        <rect x={720} y={86} width={20} height={10} fill={attentionCount ? "#F5C542" : "#c8b8a0"} />
        {attentionCount > 0 && (
          <text x={730} y={95} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={6} fill="#3a2a00">
            {Math.min(attentionCount, 99)}
          </text>
        )}
      </g>
      <Phone x={652} y={90} ringing={attentionCount > 0} frame={frame} />

      {/* Meeting room: big task board + table */}
      <Whiteboard x={792} y={30} w={156} h={86} notes={boardNotes} />
      <g shapeRendering="crispEdges">
        {(["TODO", "DOING", "REVIEW", "DONE"] as const).map((t, i) => (
          <text key={t} x={800 + i * 37} y={26} fontFamily="'Press Start 2P'" fontSize={5} fill="#2a2a3a">{t}</text>
        ))}
        <rect x={815} y={300} width={110} height={50} fill="#8a6a4a" />
        <rect x={815} y={300} width={110} height={4} fill="#a0805a" />
      </g>
      <Plant x={930} y={390} />

      {/* Main floor decor */}
      <Plant x={10} y={180} />
      <Plant x={750} y={180} />
      <Plant x={10} y={395} />
      <Plant x={750} y={395} />

      {/* Lounge */}
      <Sofa x={30} y={470} color="#8a4a6a" w={80} />
      <CoffeeMachine x={250} y={450} brewing={frame % 3 === 0} />
      <g shapeRendering="crispEdges">
        <rect x={130} y={444} width={90} height={50} fill="#1a1a1a" />
        <rect x={133} y={447} width={84} height={44} fill="#2a3a5a" />
        <text x={137} y={458} fontFamily="'Press Start 2P'" fontSize={5} fill="#9fd4f0">#general</text>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={137} y={464 + i * 8} width={40 + ((frame + i * 7) % 4) * 9} height={3} fill="#5a7aaa" />
        ))}
      </g>
      <Plant x={270} y={600} />

      {/* Finance */}
      <Safe x={440} y={450} />
      <g shapeRendering="crispEdges">
        <rect x={320} y={450} width={70} height={44} fill="#f0f0e0" />
        {[18, 26, 14, 34, 30].map((h, i) => (
          <rect key={i} x={326 + i * 12} y={488 - h} width={8} height={h} fill="#1D9E75" />
        ))}
        <rect x={330} y={560} width={110} height={24} fill="#8a6a4a" />
        <rect x={380} y={548} width={12} height={12} fill="#9fd4f0" opacity={0.7} />
        <rect x={382} y={552} width={8} height={8} fill="#F5C542" />
      </g>

      {/* Security cam room */}
      <Monitors x={500} y={448} frame={frame} />
      <g shapeRendering="crispEdges">
        <rect x={510} y={560} width={140} height={22} fill="#4a4a5a" />
      </g>

      {/* Basement / settings */}
      <ServerRack x={690} y={448} blink={frame} />
      <ServerRack x={720} y={448} blink={frame + 1} />
      <ServerRack x={750} y={448} blink={frame + 2} />
      <g shapeRendering="crispEdges">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={860 + i * 12} y={540 + i * 12} width={70 - i * 12} height={8} fill={i % 2 ? "#5a5a66" : "#6a6a76"} />
        ))}
        <text x={850} y={530} fontFamily="'Press Start 2P'" fontSize={6} fill="#F5C542">▼ B1</text>
      </g>
    </g>
  );
});

function DeskWithOwner({ slot, agent, behavior }: { slot: DeskSlot; agent?: Agent; behavior?: Behavior }) {
  const screen: Parameters<typeof Desk>[0]["screen"] = !agent
    ? "off"
    : behavior?.activity === "typing"
      ? "busy"
      : behavior?.activity === "error"
        ? "error"
        : behavior?.activity === "sleeping"
          ? "sleep"
          : "on";
  return <Desk x={slot.desk.x} y={slot.desk.y} screen={screen} label={agent?.name} />;
}

function AgentFigure({
  agent,
  behavior,
  seat,
  bubble,
  layers,
  rowYs,
  onClick,
}: {
  agent: Agent;
  behavior: Behavior;
  seat: { x: number; y: number };
  bubble?: string;
  layers: (SVGGElement | null)[];
  rowYs: number[];
  onClick: () => void;
}) {
  const appearance = useMemo<Appearance>(() => appearanceFor(agent.id, agent.role), [agent.id, agent.role]);
  const start = agent.status === "pending_approval" ? SPOTS.lobbyWait(0) : seat;
  const { pos, moving, dir } = useWalker(behavior.target, start);
  const frame = useWalkFrame(moving);
  const atDesk = !moving && Math.hypot(pos.x - seat.x, pos.y - seat.y) < 2;
  const showBack = atDesk && behavior.activity === "typing";
  const indicator = moving ? null : behavior.activity === "idle" ? null : behavior.activity;

  let band = rowYs.findIndex((y) => pos.y <= y + 3);
  if (band === -1) band = rowYs.length;
  const layer = layers[band];
  const providerName = useProviderName(agent.adapterType);

  const figure = (
    <g
      transform={`translate(${Math.round(pos.x)},${Math.round(pos.y)})`}
      {...buttonProps(`${agent.name}, ${agent.title ?? agent.role}, ${behavior.activity}`, onClick)}
      className="agent-figure"
      style={{ cursor: "pointer" }}
    >
      <ellipse cx={0} cy={1} rx={10} ry={3} fill="rgba(0,0,0,0.18)" />
      <PixelSprite
        appearance={appearance}
        expression={behavior.expression}
        moving={moving}
        frame={frame}
        flip={dir === "left"}
        back={showBack}
      />
      {!bubble && <StatusIcon kind={indicator} />}
      {bubble && <SpeechBubble text={bubble} />}
      <g className="nametag" transform="translate(0, 10)">
        <rect x={-(agent.name.length * 3 + 6)} y={-1} width={agent.name.length * 6 + 12} height={10} fill="rgba(20,20,30,0.75)" />
        <text x={0} y={7} textAnchor="middle" fontFamily="VT323" fontSize={10} fill="#fff">
          {agent.name}
        </text>
        <text x={0} y={14} textAnchor="middle" fontFamily="VT323" fontSize={8} fill="#9fd4ff">
          {providerName}
        </text>
      </g>
    </g>
  );
  return layer ? createPortal(figure, layer) : null;
}

function CeoCharacter({ ringing }: { ringing: boolean }) {
  const appearance = useMemo<Appearance>(
    () => ({ hair: "#1a1a1a", hairStyle: "neat", clothes: "#2a2a3a", skin: "#C68642", build: "a" }),
    [],
  );
  const p = SPOTS.ceoChair;
  // Decorative, like the basement janitor: without this the sprite swallows clicks
  // aimed at the CEO office and leaves a dead patch in the middle of the room.
  return (
    <g transform={`translate(${p.x},${p.y})`} pointerEvents="none" aria-hidden="true">
      <ellipse cx={0} cy={1} rx={10} ry={3} fill="rgba(0,0,0,0.18)" />
      <PixelSprite appearance={appearance} expression={ringing ? "surprised" : "normal"} moving={false} frame={0} flip={false} />
      <g transform="translate(0, 10)">
        <rect x={-15} y={-1} width={30} height={10} fill="rgba(120,20,20,0.85)" />
        <text x={0} y={7} textAnchor="middle" fontFamily="VT323" fontSize={10} fill="#fff">YOU</text>
      </g>
    </g>
  );
}

function RoomSign({ room, label, badge }: { room: RoomId; label: string; badge: number }) {
  const r = roomById[room];
  // Decorative: clicks fall through to the room's own button underneath, so a wide
  // badge can never shift the click target onto people standing in the room.
  return (
    <g className="room-sign" pointerEvents="none" aria-hidden="true">
      <g transform={`translate(${r.x + 8}, ${r.y + r.h - 16})`} shapeRendering="crispEdges">
        <rect width={label.length * 6 + 10} height={12} fill="rgba(25,20,30,0.82)" />
        <text x={5} y={9} fontFamily="'Press Start 2P'" fontSize={6} fill="#f5e6c8">
          {label}
        </text>
      </g>
      {badge > 0 && (
        <g transform={`translate(${r.x + r.w - 26}, ${r.y + 8})`} shapeRendering="crispEdges">
          <rect width={20} height={14} fill="#E24B4A" stroke="#5a1010" />
          <text x={10} y={10} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={7} fill="#fff">
            {Math.min(badge, 99)}
          </text>
        </g>
      )}
    </g>
  );
}
