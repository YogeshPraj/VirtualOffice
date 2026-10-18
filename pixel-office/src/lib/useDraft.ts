import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "pixel-office:draft:";
const MAX_AGE_MS = 14 * 86_400_000;

interface Stored {
  v: string;
  at: number;
}

function read(key: string): string {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return "";
    const s = JSON.parse(raw) as Stored;
    if (Date.now() - s.at > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return "";
    }
    return s.v;
  } catch {
    return "";
  }
}

function write(key: string, v: string) {
  try {
    if (v.trim()) localStorage.setItem(PREFIX + key, JSON.stringify({ v, at: Date.now() } satisfies Stored));
    else localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage full or blocked: the draft just isn't kept */
  }
}

/**
 * A text field's value that survives closing the panel or reloading. Clear it after sending.
 * Returns [value, setValue, clear, restored] where `restored` is true when a saved draft was loaded.
 */
export function useDraft(key: string): [string, (v: string) => void, () => void, boolean] {
  const [value, setValue] = useState(() => read(key));
  const [restored, setRestored] = useState(() => read(key) !== "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyRef = useRef(key);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Switching to another task loads that task's draft.
  useEffect(() => {
    if (keyRef.current === key) return;
    // Keep what was typed for the previous task before switching.
    clearTimeout(timer.current);
    write(keyRef.current, valueRef.current);
    keyRef.current = key;
    const v = read(key);
    setValue(v);
    setRestored(v !== "");
  }, [key]);

  const set = useCallback(
    (v: string) => {
      setValue(v);
      setRestored(false);
      clearTimeout(timer.current);
      const k = keyRef.current; // the key this text belongs to, even if the panel switches meanwhile
      timer.current = setTimeout(() => write(k, v), 300);
    },
    [],
  );
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    write(keyRef.current, "");
    setValue("");
    setRestored(false);
  }, []);

  // Flush on unmount so a draft typed just before closing isn't lost.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      write(keyRef.current, valueRef.current);
    },
    [],
  );

  return [value, set, clear, restored];
}
