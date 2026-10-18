import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { Agent, AttentionItem, Company, Issue } from "../api/types";

export interface ToastOptions {
  /** Offer an Undo button for a few seconds; it runs this. */
  undo?: () => Promise<unknown> | void;
}

export interface OfficeData {
  company: Company;
  agents: Agent[];
  issues: Issue[];
  attention: AttentionItem[];
  agentById: (id: string | null | undefined) => Agent | undefined;
  toast: (msg: string, opts?: ToastOptions) => void;
}

const Ctx = createContext<OfficeData | null>(null);

export function OfficeDataProvider({ value, children }: { value: Omit<OfficeData, "agentById" | "toast">; children: ReactNode }) {
  const [current, setCurrent] = useState<{ id: number; msg: string; undo?: ToastOptions["undo"] } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const seq = useRef(0);
  const data: OfficeData = {
    ...value,
    agentById: (id) => (id ? value.agents.find((a) => a.id === id) : undefined),
    toast: (msg, opts) => {
      const id = ++seq.current;
      setCurrent({ id, msg, undo: opts?.undo });
      setTimeout(() => setCurrent((cur) => (cur?.id === id ? null : cur)), opts?.undo ? 6000 : 3500);
    },
  };
  return (
    <Ctx.Provider value={data}>
      {children}
      {current && (
        <div className="toast" role="status">
          {current.msg}
          {current.undo && (
            <button
              className="px-btn small toast-undo"
              disabled={undoing}
              onClick={async () => {
                const undo = current.undo!;
                setUndoing(true);
                try {
                  await undo();
                  setCurrent({ id: ++seq.current, msg: "Undone." });
                  const id = seq.current;
                  setTimeout(() => setCurrent((cur) => (cur?.id === id ? null : cur)), 2000);
                } catch (e) {
                  setCurrent({ id: ++seq.current, msg: `Couldn't undo: ${(e as Error).message}` });
                } finally {
                  setUndoing(false);
                }
              }}
            >
              ↶ Undo
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useOfficeData(): OfficeData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOfficeData outside provider");
  return v;
}
