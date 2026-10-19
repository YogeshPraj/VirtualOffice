import { useEffect, useRef, useState } from "react";
import type { DeskSlot } from "./layout";
import { useOfficeData } from "../state/officeData";

const DESK_W = 64;
const FLOOR = { x0: 40, x1: 740, y0: 215, y1: 405 };
const PLAN_MS = 18_000;

export type CatPlan = { kind: "nap"; desk: number; x: number; y: number } | { kind: "walk"; x: number; y: number };

/** Where the cat goes next: usually a nap on a desk nobody's working at, otherwise a stroll. */
export function nextPlan(desks: DeskSlot[], busy: boolean[], rand = Math.random): CatPlan {
  const free = desks.map((_, i) => i).filter((i) => !busy[i]);
  if (free.length && rand() < 0.6) {
    const i = free[Math.floor(rand() * free.length)];
    return { kind: "nap", desk: i, x: desks[i].desk.x + DESK_W / 2 - 7, y: desks[i].desk.y - 6 };
  }
  return { kind: "walk", x: Math.round(FLOOR.x0 + rand() * (FLOOR.x1 - FLOOR.x0)), y: Math.round(FLOOR.y0 + rand() * (FLOOR.y1 - FLOOR.y0)) };
}

/** True when the desk the cat is napping on has just got busy: time to run. */
export const mustFlee = (plan: CatPlan, busy: boolean[]) => plan.kind === "nap" && !!busy[plan.desk];

const px = (x: number, y: number, w: number, h: number, fill: string) => <rect x={x} y={y} width={w} height={h} fill={fill} />;

function CatSprite({ napping, step }: { napping: boolean; step: boolean }) {
  const fur = "#e0913a";
  const dark = "#8a4f1c";
  if (napping)
    return (
      <g>
        {px(0, 4, 14, 6, fur)}
        {px(10, 2, 5, 5, fur)}
        {px(10, 1, 2, 2, fur)}
        {px(13, 1, 2, 2, fur)}
        {px(3, 5, 2, 4, dark)}
        {px(7, 5, 2, 4, dark)}
        {px(-3, 7, 4, 2, fur)}
        <text x={14} y={-1} fontSize={7} fontFamily="'Press Start 2P'" fill="#5a5a8a" className="cat-zzz">
          z
        </text>
      </g>
    );
  return (
    <g>
      {px(0, 3, 12, 5, fur)}
      {px(10, 0, 5, 5, fur)}
      {px(10, -1, 2, 2, fur)}
      {px(13, -1, 2, 2, fur)}
      {px(12, 2, 1, 1, "#1e1a24")}
      {px(-3, step ? 0 : 2, 3, 2, fur)}
      {px(1, 8, 2, step ? 3 : 2, dark)}
      {px(4, 8, 2, step ? 2 : 3, dark)}
      {px(7, 8, 2, step ? 3 : 2, dark)}
      {px(10, 8, 2, step ? 2 : 3, dark)}
    </g>
  );
}

/** The office cat: naps on idle desks, strolls the floor, and bolts when someone starts a shift. */
export function OfficeCat({ desks, busy }: { desks: DeskSlot[]; busy: boolean[] }) {
  const { toast } = useOfficeData();
  const [plan, setPlan] = useState<CatPlan>(() => ({ kind: "walk", x: 380, y: 330 }));
  const [walking, setWalking] = useState(false);
  const [step, setStep] = useState(false);
  const still = useRef(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const go = (p: CatPlan) => {
    setPlan(p);
    setWalking(true);
  };

  useEffect(() => {
    if (still.current) return;
    go(nextPlan(desks, busyRef.current));
    const t = setInterval(() => go(nextPlan(desks, busyRef.current)), PLAN_MS);
    return () => clearInterval(t);
  }, [desks]);

  // Someone sat down to work where the cat was sleeping.
  useEffect(() => {
    if (mustFlee(plan, busy)) go({ kind: "walk", x: Math.round(FLOOR.x0 + Math.random() * (FLOOR.x1 - FLOOR.x0)), y: FLOOR.y1 });
  }, [busy, plan]);

  useEffect(() => {
    if (!walking) return;
    const legs = setInterval(() => setStep((s) => !s), 250);
    const arrive = setTimeout(() => setWalking(false), 3_000);
    return () => {
      clearInterval(legs);
      clearTimeout(arrive);
    };
  }, [walking, plan]);

  const napping = plan.kind === "nap" && !walking;
  return (
    <g
      className="office-cat"
      style={{ transform: `translate(${plan.x}px, ${plan.y}px)`, transition: still.current ? undefined : "transform 3s linear", cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        toast(napping ? "🐱 One eye opens. It's not impressed." : "🐱 Mrrp.");
      }}
      role="img"
      aria-label="The office cat"
    >
      <title>The office cat</title>
      <rect x={-4} y={-4} width={22} height={16} fill="transparent" />
      <CatSprite napping={napping} step={step} />
    </g>
  );
}
