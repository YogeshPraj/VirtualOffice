// Pixel furniture drawn with plain SVG rects (crisp edges, no images).
import { darken } from "../pixel/sprite";

export function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect x={2} y={14} width={12} height={10} fill="#a0522d" />
      <rect x={2} y={14} width={12} height={2} fill="#7a3a1d" />
      <rect x={4} y={2} width={8} height={12} fill="#3a8a3a" />
      <rect x={0} y={6} width={6} height={6} fill="#4aa04a" />
      <rect x={10} y={4} width={6} height={7} fill="#2a7a2a" />
      <rect x={6} y={0} width={4} height={4} fill="#5ab05a" />
    </g>
  );
}

export function Sofa({ x, y, color = "#8a4a6a", w = 60 }: { x: number; y: number; color?: string; w?: number }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={w} height={10} fill={darken(color, 30)} />
      <rect y={8} width={w} height={14} fill={color} />
      <rect x={-4} y={4} width={6} height={18} fill={darken(color, 20)} />
      <rect x={w - 2} y={4} width={6} height={18} fill={darken(color, 20)} />
      <rect x={w / 2 - 1} y={10} width={2} height={10} fill={darken(color, 15)} />
    </g>
  );
}

export function CoffeeMachine({ x, y, brewing }: { x: number; y: number; brewing?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={20} height={30} fill="#4a4a52" />
      <rect x={2} y={2} width={16} height={8} fill="#2a2a32" />
      <rect x={4} y={4} width={4} height={3} fill={brewing ? "#E24B4A" : "#5a5a6a"} />
      <rect x={6} y={16} width={8} height={8} fill="#1a1a1a" />
      <rect x={7} y={20} width={6} height={4} fill="#fff" />
    </g>
  );
}

export function Window({ x, y, w = 50 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={w} height={22} fill="#5a4a3a" />
      <rect x={3} y={3} width={w - 6} height={16} fill="#9fd4f0" />
      <rect x={w / 2 - 1} y={3} width={2} height={16} fill="#5a4a3a" />
      <rect x={6} y={5} width={8} height={3} fill="#e0f4ff" />
    </g>
  );
}

export function Bookshelf({ x, y }: { x: number; y: number }) {
  const books = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#16a085"];
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={40} height={34} fill="#6a4a2a" />
      {[0, 1].map((r) => (
        <g key={r}>
          <rect x={2} y={2 + r * 16} width={36} height={14} fill="#3a2a1a" />
          {books.map((_c, i) => (
            <rect key={i} x={3 + i * 6} y={4 + r * 16} width={5} height={12} fill={books[(i + r * 2) % books.length]} />
          ))}
        </g>
      ))}
    </g>
  );
}

export function ServerRack({ x, y, blink, off }: { x: number; y: number; blink: number; off?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={26} height={52} fill="#2a2a32" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={3} y={4 + i * 9} width={20} height={6} fill="#3a3a46" />
          <rect x={5} y={6 + i * 9} width={2} height={2} fill={off ? "#2a1a1a" : (blink + i) % 3 === 0 ? "#4ae04a" : "#1a5a1a"} />
          <rect x={9} y={6 + i * 9} width={2} height={2} fill={off ? "#3a1010" : (blink + i) % 4 === 0 ? "#F5A623" : "#5a3a10"} />
        </g>
      ))}
    </g>
  );
}

export function Safe({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={34} height={34} fill="#5a6a6a" />
      <rect x={3} y={3} width={28} height={28} fill="#7a8a8a" />
      <rect x={13} y={13} width={8} height={8} fill="#3a4a4a" />
      <rect x={16} y={9} width={2} height={4} fill="#3a4a4a" />
    </g>
  );
}

export function Monitors({ x, y, frame }: { x: number; y: number; frame: number }) {
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      {[0, 1, 2].map((c) =>
        [0, 1].map((r) => (
          <g key={`${c}${r}`}>
            <rect x={c * 30} y={r * 22} width={28} height={20} fill="#1a1a1a" />
            <rect x={c * 30 + 2} y={r * 22 + 2} width={24} height={16} fill={(frame + c + r) % 5 === 0 ? "#2a4a2a" : "#1a3a2a"} />
            <rect x={c * 30 + 4} y={r * 22 + 4 + ((frame + c) % 3) * 4} width={14} height={2} fill="#4ae04a" opacity={0.7} />
          </g>
        )),
      )}
    </g>
  );
}

export function Whiteboard({ x, y, w, h, notes }: { x: number; y: number; w: number; h: number; notes: { color: string }[][] }) {
  const cols = notes.length;
  const colW = (w - 8) / cols;
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect width={w} height={h} fill="#c8c8d0" />
      <rect x={3} y={3} width={w - 6} height={h - 6} fill="#fafafa" />
      {notes.map((col, ci) => (
        <g key={ci}>
          {ci > 0 && <rect x={4 + ci * colW} y={6} width={1} height={h - 12} fill="#ddd" />}
          {col.slice(0, 8).map((n, ni) => (
            <rect
              key={ni}
              x={6 + ci * colW + (ni % 2) * (colW / 2 - 1)}
              y={8 + Math.floor(ni / 2) * 9}
              width={colW / 2 - 3}
              height={7}
              fill={n.color}
            />
          ))}
        </g>
      ))}
      <rect x={w / 2 - 10} y={h} width={20} height={4} fill="#9a9aa2" />
    </g>
  );
}

export function Desk({
  x,
  y,
  screen,
  label,
}: {
  x: number;
  y: number;
  screen: "off" | "on" | "busy" | "error" | "sleep";
  label?: string;
}) {
  const screenColor = { off: "#2a2a3a", on: "#3a6aa0", busy: "#2a8a5a", error: "#a02a2a", sleep: "#1a1a4a" }[screen];
  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      {/* desk top */}
      <rect y={8} width={64} height={22} fill="#a0703a" />
      <rect y={8} width={64} height={3} fill="#b8884a" />
      <rect y={28} width={64} height={4} fill="#704a20" />
      <rect x={2} y={32} width={4} height={6} fill="#5a3a18" />
      <rect x={58} y={32} width={4} height={6} fill="#5a3a18" />
      {/* monitor faces the agent (back of monitor toward viewer) */}
      <rect x={20} y={-6} width={24} height={16} fill="#2a2a32" />
      <rect x={22} y={-4} width={20} height={12} fill={screenColor} opacity={0.35} />
      <rect x={30} y={10} width={4} height={2} fill="#2a2a32" />
      {/* keyboard + mug */}
      <rect x={18} y={16} width={22} height={5} fill="#d0d0d8" />
      <rect x={48} y={14} width={6} height={7} fill="#f0f0f0" />
      {label && <DeskPlate label={label} />}
    </g>
  );
}

const PLATE_TEXT_W = 46; // usable width inside the plate, in world px
const CHAR_W = 4.6; // VT323 advance at fontSize 9

/** Full name on the plate; long names are horizontally squeezed to fit instead of cut. */
function DeskPlate({ label }: { label: string }) {
  const name = label.length > 16 ? `${label.slice(0, 15)}…` : label;
  const natural = name.length * CHAR_W;
  const squeeze = natural > PLATE_TEXT_W;
  return (
    <g>
      <title>{label}</title>
      <rect x={6} y={21} width={Math.min(52, natural + 6)} height={8} fill="#f5e6c8" />
      <text
        x={9}
        y={28}
        fontFamily="VT323"
        fontSize={9}
        fill="#3a2a1a"
        {...(squeeze ? { textLength: PLATE_TEXT_W, lengthAdjust: "spacingAndGlyphs" as const } : {})}
      >
        {name}
      </text>
    </g>
  );
}

export function Phone({ x, y, ringing, frame }: { x: number; y: number; ringing: boolean; frame: number }) {
  const shake = ringing && frame % 2 === 0 ? 1 : 0;
  return (
    <g transform={`translate(${x + shake},${y})`} shapeRendering="crispEdges">
      <rect width={14} height={8} fill="#E24B4A" />
      <rect x={-2} y={-3} width={18} height={4} fill="#b03030" />
      <rect x={4} y={2} width={6} height={4} fill="#5a1010" />
      {ringing && (
        <>
          <rect x={-6} y={-8} width={2} height={4} fill="#F5C542" />
          <rect x={18} y={-8} width={2} height={4} fill="#F5C542" />
        </>
      )}
    </g>
  );
}
