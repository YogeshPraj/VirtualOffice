import { useEffect, useState } from "react";

export type Decor = "spring" | "summer" | "autumn" | "winter" | "halloween" | "diwali" | "holidays" | "new-year";

const KEY = "pixel-office:decor";
export const DECOR_EVENT = "pixel-office:decor-changed";

/** Diwali (Lakshmi Puja) by year; lights go up a few days either side. */
const DIWALI: Record<number, string> = { 2026: "2026-11-08", 2027: "2027-10-29", 2028: "2028-10-17", 2029: "2029-11-05", 2030: "2030-10-26" };

const md = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate();

/** The décor for a day: the season, plus any festival around it. */
export function decorFor(d: Date): Decor[] {
  const m = d.getMonth() + 1;
  const out: Decor[] = [m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter"];
  const n = md(d);
  if (n >= 1025 && n <= 1031) out.push("halloween");
  const diwali = DIWALI[d.getFullYear()];
  if (diwali) {
    const days = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.parse(`${diwali}T00:00:00Z`)) / 86_400_000;
    if (days >= -3 && days <= 2) out.push("diwali");
  }
  if (n >= 1210 || n <= 106) out.push("holidays");
  if (n === 1231 || n === 101) out.push("new-year");
  return out;
}

export function useDecorPref() {
  const read = () => {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  };
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener(DECOR_EVENT, sync);
    return () => window.removeEventListener(DECOR_EVENT, sync);
  }, []);
  const toggle = () => {
    try {
      localStorage.setItem(KEY, on ? "off" : "on");
    } catch {
      /* this session only */
    }
    window.dispatchEvent(new Event(DECOR_EVENT));
  };
  return { on, toggle };
}

const px = (x: number, y: number, w: number, h: number, fill: string, key?: string | number, cls?: string) => <rect key={key} x={x} y={y} width={w} height={h} fill={fill} className={cls} />;

function Leaves() {
  // A few fallen leaves in the corners of the main floor and lounge.
  const spots = [
    [40, 330, "#d2691e"], [58, 338, "#b5401f"], [70, 326, "#e3a21a"], [700, 342, "#d2691e"], [716, 334, "#e3a21a"],
    [30, 600, "#b5401f"], [48, 610, "#d2691e"], [250, 612, "#e3a21a"], [455, 612, "#b5401f"],
  ] as const;
  return <>{spots.map(([x, y, c], i) => <g key={i}>{px(x, y, 6, 4, c)}{px(x + 2, y + 4, 2, 2, "#6b3a1a")}</g>)}</>;
}

function Pumpkin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {px(x + 2, y, 14, 12, "#e86f12")}
      {px(x, y + 2, 18, 8, "#e86f12")}
      {px(x + 8, y - 4, 2, 4, "#3d6b1f")}
      {px(x + 4, y + 3, 3, 3, "#2a1a08")}
      {px(x + 11, y + 3, 3, 3, "#2a1a08")}
      {px(x + 5, y + 8, 8, 2, "#2a1a08")}
    </g>
  );
}

function Diyas() {
  // Little clay lamps along the lobby front, and a rangoli by its door.
  const xs = [30, 70, 110, 190, 230, 270];
  return (
    <g>
      {xs.map((x, i) => (
        <g key={i}>
          {px(x, 156, 10, 4, "#a0522d")}
          {px(x + 3, 151, 4, 5, "#ffcc33", undefined, "decor-flicker")}
          {px(x + 4, 149, 2, 2, "#fff3b0", undefined, "decor-flicker")}
        </g>
      ))}
      {px(138, 176, 24, 24, "#e2367a")}
      {px(142, 180, 16, 16, "#f5c542")}
      {px(146, 184, 8, 8, "#1d9e75")}
      {px(148, 186, 4, 4, "#fff")}
    </g>
  );
}

function Lights() {
  // A string of coloured bulbs along the top wall.
  const colors = ["#e24b4a", "#f5c542", "#1d9e75", "#378add"];
  return (
    <g>
      {px(0, 7, 960, 1, "#2a2a2a")}
      {Array.from({ length: 40 }, (_, i) => px(6 + i * 24, 8, 4, 5, colors[i % 4], i, i % 2 ? "decor-blink" : "decor-blink-alt"))}
    </g>
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {px(x + 10, y, 4, 4, "#f5c542")}
      {px(x + 6, y + 4, 12, 8, "#1f6b3a")}
      {px(x + 3, y + 12, 18, 10, "#1f6b3a")}
      {px(x, y + 22, 24, 10, "#1f6b3a")}
      {px(x + 10, y + 32, 4, 6, "#6b3a1a")}
      {px(x + 6, y + 14, 3, 3, "#e24b4a")}
      {px(x + 15, y + 24, 3, 3, "#378add")}
      {px(x + 4, y + 26, 3, 3, "#f5c542")}
    </g>
  );
}

function Flowers() {
  const spots = [[280, 70], [30, 140], [510, 140], [20, 405], [760, 405]] as const;
  return <>{spots.map(([x, y], i) => <g key={i}>{px(x, y, 4, 4, i % 2 ? "#ff8ac8" : "#fff27a")}{px(x + 5, y + 2, 4, 4, "#c9a7ff")}{px(x + 3, y + 6, 2, 4, "#3d8b3d")}</g>)}</>;
}

function Summer() {
  // A beach ball in the lounge and a desk fan by the window.
  return (
    <g>
      {px(220, 590, 14, 14, "#fff")}
      {px(220, 590, 7, 7, "#e24b4a")}
      {px(227, 597, 7, 7, "#378add")}
      {px(240, 120, 10, 10, "#9fd4f0")}
      {px(244, 130, 2, 10, "#555")}
    </g>
  );
}

function Snow() {
  const flakes = [[60, 20], [200, 40], [340, 25], [470, 50], [610, 30], [880, 60], [120, 450], [560, 470]] as const;
  return <>{flakes.map(([x, y], i) => px(x, y, 3, 3, "#ffffff", i, "decor-snow"))}</>;
}

function Banner() {
  return (
    <g>
      {px(330, 182, 300, 18, "#2a2a3a")}
      <text x={480} y={195} textAnchor="middle" fontFamily="'Press Start 2P'" fontSize={8} fill="#f5c542">
        HAPPY NEW YEAR!
      </text>
    </g>
  );
}

/** Seasonal and festive touches drawn over the furniture. Purely decorative: never takes clicks. */
export function SeasonalDecor({ date = new Date() }: { date?: Date }) {
  const { on } = useDecorPref();
  if (!on) return null;
  const d = decorFor(date);
  return (
    <g className="seasonal-decor" pointerEvents="none" aria-hidden="true">
      {d.includes("spring") && <Flowers />}
      {d.includes("summer") && <Summer />}
      {d.includes("autumn") && <Leaves />}
      {d.includes("winter") && <Snow />}
      {d.includes("halloween") && (
        <>
          <Pumpkin x={20} y={140} />
          <Pumpkin x={250} y={600} />
        </>
      )}
      {d.includes("diwali") && <Diyas />}
      {d.includes("holidays") && (
        <>
          <Lights />
          <Tree x={240} y={110} />
        </>
      )}
      {d.includes("new-year") && <Banner />}
    </g>
  );
}
