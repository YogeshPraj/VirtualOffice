import { useEffect, useState } from "react";

const EVENT = "pixel-office:error";

/** Report a failed action. Every failed mutation lands here (see main.tsx), so errors can't vanish. */
export function reportError(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** Sticky red bar listing failed actions until the CEO dismisses them. */
export function ErrorBar() {
  const [errors, setErrors] = useState<{ id: number; text: string; at: Date }[]>([]);
  useEffect(() => {
    let next = 0;
    const onError = (e: Event) => {
      const text = (e as CustomEvent<string>).detail || "Something went wrong.";
      setErrors((list) => [{ id: next++, text, at: new Date() }, ...list.filter((x) => x.text !== text)].slice(0, 4));
    };
    window.addEventListener(EVENT, onError);
    return () => window.removeEventListener(EVENT, onError);
  }, []);
  if (errors.length === 0) return null;
  return (
    <div className="error-bar" role="alert">
      {errors.map((e) => (
        <div key={e.id} className="row">
          <span style={{ flex: 1 }}>
            ⚠ {e.text} <span style={{ opacity: 0.7 }}>({e.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})</span>
          </span>
          <button className="px-btn small" onClick={() => setErrors((l) => l.filter((x) => x.id !== e.id))}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
