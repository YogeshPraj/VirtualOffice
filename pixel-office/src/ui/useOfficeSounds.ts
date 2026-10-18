import { useEffect, useRef, useState } from "react";
import type { Issue } from "../api/types";
import { useOffice } from "../state/officeStore";

const PREF = "pixel-office:sounds";
const EVENT = "pixel-office:sounds-pref";
/** Someone counts as typing for this long after their last output. */
const TYPING_WINDOW_MS = 1500;

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, len: number, vol: number, type: OscillatorType = "square") {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + len);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + len + 0.02);
}

/** One soft key press: a short, slightly random click. */
const keyClick = () => blip(1800 + Math.random() * 900, 0, 0.018, 0.012, "triangle");
/** Task done: a rising three-note chime. */
const doneChime = () => [659, 784, 1047].forEach((f, i) => blip(f, i * 0.09, 0.16, 0.035));

const readPref = () => {
  try {
    return localStorage.getItem(PREF) === "on";
  } catch {
    return false;
  }
};

export function useSoundPref() {
  const [on, setOn] = useState(readPref);
  useEffect(() => {
    const f = () => setOn(readPref());
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
  const toggle = () => {
    const next = !on;
    try {
      localStorage.setItem(PREF, next ? "on" : "off");
    } catch {
      /* not kept */
    }
    if (next) {
      audio(); // created from the click, so the browser allows sound
      doneChime();
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return { on, toggle };
}

/** Which tasks became done since the last look (none on the first look). */
export function newlyDone(prev: Map<string, string> | null, issues: Pick<Issue, "id" | "status">[]): string[] {
  if (!prev) return [];
  return issues.filter((i) => i.status === "done" && prev.has(i.id) && prev.get(i.id) !== "done").map((i) => i.id);
}

/** Plays the office's sounds while they're switched on and the office is on screen. */
export function useOfficeSounds(issues: Issue[]) {
  const { on } = useSoundPref();
  const lastOutputAt = useOffice((s) => s.lastOutputAt);
  const latest = useRef(0);
  latest.current = Math.max(0, ...Object.values(lastOutputAt));
  const prev = useRef<Map<string, string> | null>(null);

  // Typing: a few irregular clicks a second while anyone is producing output.
  useEffect(() => {
    if (!on) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stop) return;
      if (document.visibilityState === "visible" && Date.now() - latest.current < TYPING_WINDOW_MS) keyClick();
      t = setTimeout(tick, 90 + Math.random() * 220);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [on]);

  // A chime when a task is finished.
  useEffect(() => {
    const done = newlyDone(prev.current, issues);
    prev.current = new Map(issues.map((i) => [i.id, i.status]));
    if (on && done.length) doneChime();
  }, [issues, on]);
}
