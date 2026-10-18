import { useEffect, useLayoutEffect, useState } from "react";
import { useOffice, type RoomId } from "../state/officeStore";
import { useOfficeData } from "../state/officeData";

const DONE_KEY = "pixel-office:tour-done";
export const TOUR_EVENT = "pixel-office:tour";

interface Step {
  /** `data-tour` value of the element to spotlight; none = centred card. */
  target?: string;
  title: string;
  body: string;
  room?: RoomId;
}

const STEPS: Step[] = [
  {
    title: "Welcome to your office",
    body: "You're the CEO. Your employees are AI agents (Claude Code or Copilot) who pick up tasks, work on them and come to you when they need a decision. This 1-minute tour shows where everything is.",
  },
  {
    target: "intake",
    title: "📥 Intake desk",
    body: "Paste Azure DevOps work items, GitHub issues/PRs or any link. The office looks them up and turns them into tasks for your team lead, who plans and delegates.",
  },
  {
    target: "task",
    title: "📌 Task board",
    body: "Every task is a sticky note. Drag notes between columns, search and filter, and open one to see its documents, work products, sub-tasks and thread.",
  },
  {
    target: "inbox",
    title: "☎ Your inbox",
    body: "When someone needs you (a question, an approval, a review) it lands here and the button turns red. Turn on 🔔 ALERTS to get a desktop notification too.",
  },
  {
    target: "floor",
    title: "🧑‍💻 The main floor",
    body: "Click an employee to see what they're on, switch their brain (Claude or Copilot), fix problems, or look over their shoulder at their live run.",
  },
  {
    target: "study",
    title: "📓 The Study",
    body: "Your second brain. Write down how you work, decisions and assets, or import a folder of notes. Every employee checks it before working.",
  },
  {
    target: "today",
    title: "📰 Today",
    body: "A stand-up summary of the day: done, in progress, blocked and waiting on you. One click copies it as text.",
  },
  {
    target: "building",
    title: "🟢 Building status",
    body: "Green means everything the office needs is running. If something turns yellow or red, open it for the exact fix.",
  },
  {
    target: "palette",
    title: "🔎 Ctrl+K",
    body: "Jump to any task, employee or room from the keyboard, or type a title to pin a new task.",
  },
  {
    target: "stairs",
    title: "▼ B1: the machinery",
    body: "Downstairs: settings and working hours, org chart, skills, routines, projects, tools, the secrets vault and the adapters. Start with HR (+ HIRE) if your office is empty.",
  },
];

function done(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // no storage: don't nag on every load
  }
}

/** A short spotlight tour of the rooms, shown once on a new install and on request. */
export function Tour() {
  const { agents } = useOfficeData();
  const close = useOffice((s) => s.close);
  const floor = useOffice((s) => s.floor);
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // New installs get the tour once there's a company; an empty office goes to HR first.
    if (!done() && agents.length > 0) setStep(0);
    const onStart = () => {
      close();
      setStep(0);
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [agents.length > 0, close]);

  const current = step === null ? null : STEPS[step];

  useLayoutEffect(() => {
    if (!current?.target) return setRect(null);
    const find = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener("resize", find);
    return () => window.removeEventListener("resize", find);
  }, [current?.target, floor]);

  if (!current || step === null) return null;
  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* fine */
    }
    setStep(null);
  };
  const last = step === STEPS.length - 1;

  // Place the card below the spotlight, or above it near the bottom of the screen.
  const pad = 6;
  const cardStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        left: Math.max(16, Math.min(window.innerWidth - 376, rect.left + rect.width / 2 - 180)),
        ...(rect.bottom + 220 < window.innerHeight ? { top: rect.bottom + pad + 10 } : { bottom: window.innerHeight - rect.top + pad + 10 }),
      }
    : { position: "fixed", left: "50%", top: "30%", transform: "translateX(-50%)" };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Office tour">
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card px-card" style={cardStyle}>
        <div className="muted" style={{ fontSize: 14 }}>
          {step + 1} / {STEPS.length}
        </div>
        <h4>{current.title}</h4>
        <div style={{ fontSize: 18 }}>{current.body}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="px-btn small" onClick={finish}>
            Skip tour
          </button>
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <button className="px-btn small" onClick={() => setStep(step - 1)}>
              ◀ Back
            </button>
          )}
          <button className="px-btn small primary" autoFocus onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Start working" : "Next ▶"}
          </button>
        </div>
      </div>
    </div>
  );
}
