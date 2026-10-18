import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchHit } from "../api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import { useOfficeData } from "../state/officeData";
import { useOffice, type Panel, type RoomId } from "../state/officeStore";
import { ROOM_TITLES } from "../panels/PanelDock";
import { TOUR_EVENT } from "./Tour";

interface Command {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  detail?: ReactNode;
  run: () => void;
}

const SOURCE_ICON: Record<string, string> = { Title: "📌", Description: "📝", Comment: "💬", Artifact: "📄", Document: "📄" };

/** A snippet with its search matches marked. */
function Snippet({ hit }: { hit: SearchHit }) {
  const s = hit.snippets?.find((x) => x.field !== "title") ?? hit.snippets?.[0];
  const text = s?.text ?? hit.snippet;
  if (!s?.highlights?.length) return <>{text.slice(0, 160)}</>;
  const out: ReactNode[] = [];
  let at = 0;
  for (const h of s.highlights.slice(0, 6)) {
    if (h.start < at) continue;
    out.push(text.slice(at, h.start), <mark key={h.start}>{text.slice(h.start, h.end)}</mark>);
    at = h.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

const BASEMENT: RoomId[] = ["settings", "org", "skills", "routines", "projects", "tools", "vault", "adapters"];
const HIDDEN_ROOMS: RoomId[] = ["basement"];

/** Fuzzy-ish score: all words must appear; earlier and prefix matches rank higher. */
export function score(text: string, query: string): number {
  const t = text.toLowerCase();
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = t.indexOf(word);
    if (at < 0) return -1;
    total += at === 0 ? 0 : t[at - 1] === " " || t[at - 1] === "-" ? 1 : 3 + at / 100;
  }
  return total;
}

/** Ctrl+K / Cmd+K: jump to any task, employee or room, or pin a new task. */
export function CommandPalette() {
  const { company, issues, agents, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShown((s) => !s);
      }
    };
    const onOpen = () => setShown(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pixel-office:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pixel-office:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (shown) {
      setQuery("");
      setCursor(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [shown]);

  const create = useMutation({
    mutationFn: (title: string) => api.createIssue(company.id, { title, status: "todo", assigneeAgentId: null }),
    onSuccess: (issue) => {
      toast(`Pinned ${issue.identifier}. Assign it in the task panel.`);
      qc.invalidateQueries({ queryKey: keys.issues(company.id) });
      open({ kind: "issue", issueId: issue.id });
    },
    onError: (e: Error) => toast(e.message),
  });

  const all = useMemo<Command[]>(() => {
    // Rooms live on a floor: walk there first. Tasks and people open wherever you are.
    const go = (panel: Panel, floor?: "ground" | "basement") => () => {
      if (floor && useOffice.getState().floor !== floor) goFloor(floor);
      open(panel);
    };
    const rooms = (Object.keys(ROOM_TITLES) as RoomId[])
      .filter((r) => !HIDDEN_ROOMS.includes(r))
      .map((r) => ({ id: `room:${r}`, icon: "🚪", label: ROOM_TITLES[r], hint: BASEMENT.includes(r) ? "B1" : "room", run: go({ kind: "room", room: r }, BASEMENT.includes(r) ? "basement" : "ground") }));
    const people = agents
      .filter((a) => a.status !== "terminated")
      .map((a) => ({ id: `agent:${a.id}`, icon: "🧑‍💻", label: `${a.name}${a.title ? ` · ${a.title}` : ""}`, hint: a.status.replace("_", " "), run: go({ kind: "agent", agentId: a.id }) }));
    const tasks = issues
      .filter((i) => !i.hiddenAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((i) => ({ id: `issue:${i.id}`, icon: "📌", label: `${i.identifier} ${i.title}`, hint: i.status.replace("_", " "), run: go({ kind: "issue", issueId: i.id }) }));
    const extras: Command[] = [{ id: "tour", icon: "🗺", label: "Take the office tour", hint: "help", run: () => window.dispatchEvent(new Event(TOUR_EVENT)) }];
    return [...rooms, ...extras, ...people, ...tasks];
  }, [agents, issues, open, goFloor]);

  const q = query.trim();
  // Deep search (threads and documents) once the CEO pauses typing.
  const [deepQ, setDeepQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDeepQ(q.length >= 3 ? q : ""), 300);
    return () => clearTimeout(t);
  }, [q]);
  const deep = useQuery({
    queryKey: ["search", company.id, deepQ],
    queryFn: () => api.search(company.id, deepQ),
    enabled: shown && deepQ.length >= 3,
    staleTime: 30_000,
  });
  const deepCommands = useMemo<Command[]>(() => {
    if (!deepQ || deepQ !== q) return [];
    return (deep.data?.results ?? []).map((h) => {
      const ident = h.issue?.identifier ?? h.href.match(/\/issues\/([A-Z][A-Z0-9]*-\d+)/)?.[1];
      const issue = h.issue?.id ? issues.find((i) => i.id === h.issue!.id) : issues.find((i) => i.identifier === ident);
      return {
        id: `deep:${h.id}`,
        icon: SOURCE_ICON[h.sourceLabel] ?? "🔎",
        label: h.title,
        hint: h.sourceLabel.toLowerCase(),
        detail: <Snippet hit={h} />,
        run: () => (issue ? open({ kind: "issue", issueId: issue.id }) : toast("That result isn't a task in this office.")),
      };
    });
  }, [deep.data, deepQ, q, issues, open, toast]);

  const results = useMemo(() => {
    if (!q) return all.filter((c) => !c.id.startsWith("issue:")).concat(all.filter((c) => c.id.startsWith("issue:")).slice(0, 5));
    const hits = all
      .map((c) => ({ c, s: score(c.label, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map((x) => x.c);
    const pin: Command = { id: "new", icon: "＋", label: `New task: "${q}"`, hint: "new", run: () => create.mutate(q) };
    // Title hits first, then matches inside threads and documents (minus tasks already listed).
    const shownIssues = new Set(hits.filter((c) => c.id.startsWith("issue:")).map((c) => c.label.split(" ")[0]));
    const deeper = deepCommands.filter((c) => !shownIssues.has(c.label.split(" ")[0]) || c.hint !== "title");
    return [...hits, ...deeper.slice(0, 10), pin];
  }, [all, q, create, deepCommands]);

  if (!shown) return null;
  const pick = (c: Command | undefined) => {
    if (!c) return;
    setShown(false);
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setShown(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="px-input"
          style={{ margin: 0 }}
          aria-label="Jump to a task, employee or room"
          placeholder="Jump to a task, employee or room… or type a new task"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setShown(false);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[cursor]);
            }
          }}
        />
        <div className="palette-list" role="listbox">
          {results.map((c, i) => (
            <button
              key={c.id}
              role="option"
              aria-selected={i === cursor}
              className={`palette-item ${i === cursor ? "on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(c)}
            >
              <span>{c.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {c.label}
                {c.detail && <small className="palette-detail">{c.detail}</small>}
              </span>
              {c.hint && <small className="muted">{c.hint}</small>}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          ↑↓ to move · Enter to open · Esc to close{deep.isFetching ? " · searching threads and documents…" : q.length >= 3 ? " · threads and documents included" : ""}
        </div>
      </div>
    </div>
  );
}
