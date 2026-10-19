import { useEffect, useState } from "react";

export const SIZES = [
  { id: "s", label: "A−", zoom: 0.9 },
  { id: "m", label: "A", zoom: 1 },
  { id: "l", label: "A+", zoom: 1.15 },
  { id: "xl", label: "A++", zoom: 1.3 },
] as const;
export type SizeId = (typeof SIZES)[number]["id"];

const KEY = "pixel-office:text-size";

export function readSize(): SizeId {
  try {
    const v = localStorage.getItem(KEY);
    return SIZES.some((s) => s.id === v) ? (v as SizeId) : "m";
  } catch {
    return "m";
  }
}

/** Panels, the HUD and dialogs scale together; the pixel-art office itself keeps its size. */
export function applySize(id: SizeId) {
  document.documentElement.style.setProperty("--ui-zoom", String(SIZES.find((s) => s.id === id)?.zoom ?? 1));
}

export function useTextSize() {
  const [size, setSizeState] = useState<SizeId>(readSize);
  useEffect(() => applySize(size), [size]);
  useEffect(() => {
    const f = () => setSizeState(readSize());
    window.addEventListener("pixel-office:text-size", f);
    return () => window.removeEventListener("pixel-office:text-size", f);
  }, []);
  const setSize = (id: SizeId) => {
    setSizeState(id);
    window.dispatchEvent(new Event("pixel-office:text-size"));
  };
  return {
    size,
    set: (id: SizeId) => {
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* not kept */
      }
      setSize(id);
    },
  };
}
