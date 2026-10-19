import { useEffect, useRef, useState } from "react";

export const CELEBRATE = "pixel-office:celebrate";

/** Ask the office to celebrate (message shown under the confetti). */
export const celebrate = (message: string) => window.dispatchEvent(new CustomEvent(CELEBRATE, { detail: message }));

const COLORS = ["#f5c542", "#1d9e75", "#378add", "#e24b4a", "#c9a7ff", "#ff8a8a"];

export interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

/** A burst of square pixel confetti across `width`. */
export function burst(width: number, n = 90, rand = Math.random): Piece[] {
  return Array.from({ length: n }, () => ({
    x: rand() * width,
    y: -10 - rand() * 120,
    vx: (rand() - 0.5) * 2.2,
    vy: 2 + rand() * 3,
    size: 4 + Math.floor(rand() * 3) * 2,
    color: COLORS[Math.floor(rand() * COLORS.length)],
  }));
}

/** Full-screen pixel confetti for a couple of seconds; nothing at all if motion is reduced. */
export function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    let hide: ReturnType<typeof setTimeout>;
    const onCelebrate = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setMessage(text);
      clearTimeout(hide);
      hide = setTimeout(() => setMessage(null), 3200);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const c = canvas.current;
      const g = c?.getContext("2d");
      if (!c || !g) return;
      c.width = innerWidth;
      c.height = innerHeight;
      let pieces = burst(c.width);
      const started = performance.now();
      cancelAnimationFrame(frame);
      const step = (t: number) => {
        g.clearRect(0, 0, c.width, c.height);
        for (const p of pieces) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04;
          g.fillStyle = p.color;
          g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        pieces = pieces.filter((p) => p.y < c.height + 10);
        if (pieces.length && t - started < 3500) frame = requestAnimationFrame(step);
        else g.clearRect(0, 0, c.width, c.height);
      };
      frame = requestAnimationFrame(step);
    };
    window.addEventListener(CELEBRATE, onCelebrate);
    return () => {
      window.removeEventListener(CELEBRATE, onCelebrate);
      cancelAnimationFrame(frame);
      clearTimeout(hide);
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="confetti" aria-hidden="true" />
      {message && (
        <div className="celebrate-msg" role="status">
          🎉 {message}
        </div>
      )}
    </>
  );
}

/** True when this update completes a non-empty list that wasn't complete before. */
export function justCompleted(prev: boolean | null, doneCount: number, total: number): boolean {
  return prev === false && total > 0 && doneCount === total;
}
