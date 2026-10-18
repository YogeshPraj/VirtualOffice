import { useRef, useState } from "react";
import type { Agent } from "../api/types";
import { mentionAtCaret } from "../lib/mentions";
import { Avatar } from "./Avatar";

/** A textarea that suggests employees after "@" (Tab/Enter to pick, Esc to dismiss). */
export function MentionTextarea({
  value,
  onChange,
  people,
  onSubmit,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  people: Agent[];
  onSubmit?: () => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onSubmit">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [cursor, setCursor] = useState(0);

  const matches = at ? people.filter((p) => p.name.toLowerCase().startsWith(at.query.toLowerCase())).slice(0, 6) : [];

  const refresh = (el: HTMLTextAreaElement) => {
    setAt(mentionAtCaret(el.value, el.selectionStart ?? el.value.length));
    setCursor(0);
  };

  const pick = (p: Agent) => {
    const el = ref.current;
    if (!el || !at) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, at.start)}@${p.name} ${value.slice(caret)}`;
    onChange(next);
    setAt(null);
    requestAnimationFrame(() => {
      const pos = at.start + p.name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target);
        }}
        onClick={(e) => refresh(e.currentTarget)}
        onBlur={() => setTimeout(() => setAt(null), 150)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown") return e.preventDefault(), setCursor((c) => (c + 1) % matches.length);
            if (e.key === "ArrowUp") return e.preventDefault(), setCursor((c) => (c - 1 + matches.length) % matches.length);
            if (e.key === "Tab" || e.key === "Enter") return e.preventDefault(), pick(matches[cursor]);
            if (e.key === "Escape") return e.stopPropagation(), setAt(null);
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {matches.length > 0 && (
        <div className="mention-pop" role="listbox" aria-label="Mention someone">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === cursor}
              className={`palette-item ${i === cursor ? "on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <Avatar agent={p} size={20} />
              <span style={{ flex: 1 }}>@{p.name}</span>
              <small className="muted">{p.title ?? p.role}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
