import type { KeyboardEvent } from "react";

/**
 * Props that make an SVG shape behave like a real button: reachable with Tab,
 * announced by screen readers, and activated by Enter/Space as well as a click.
 */
export function buttonProps(label: string, onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
