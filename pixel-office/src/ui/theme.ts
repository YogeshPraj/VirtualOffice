import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";
const KEY = "pixel-office:theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Light or dark for a choice ("auto" follows Windows). */
export const resolveTheme = (choice: ThemeChoice, osDark: boolean): "light" | "dark" => (choice === "auto" ? (osDark ? "dark" : "light") : choice);

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolveTheme(choice, systemDark());
}

export const THEME_ICON: Record<ThemeChoice, string> = { auto: "🖥", light: "☀", dark: "🌙" };
const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readTheme);
  // Several components show the theme (HUD, palette): keep them in step.
  useEffect(() => {
    const f = () => setChoiceState(readTheme());
    window.addEventListener("pixel-office:theme", f);
    return () => window.removeEventListener("pixel-office:theme", f);
  }, []);
  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    window.dispatchEvent(new Event("pixel-office:theme"));
  };
  useEffect(() => {
    applyTheme(choice);
    if (choice !== "auto" || typeof matchMedia === "undefined") return;
    // Follow Windows switching between light and dark while the office is open.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const f = () => applyTheme("auto");
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [choice]);
  const set = (next: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not kept */
    }
    setChoice(next);
  };
  return {
    choice,
    set,
    cycle: () => {
      const next = NEXT[choice];
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* not kept */
      }
      setChoice(next);
    },
  };
}
