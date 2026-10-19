import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/hooks";
import type { Issue } from "../api/types";
import { cronFor, describeCron, SCHEDULES } from "../lib/schedules";
import { useOfficeData } from "../state/officeData";
import { useOffice } from "../state/officeStore";

/** What a routine made from this task looks like (the title without "Copy of"/"Follow-up:"). */
export function routineFromTask(issue: Pick<Issue, "title" | "description" | "assigneeAgentId">) {
  return {
    title: issue.title.replace(/^(Copy of|Follow-up:)\s+/i, "").trim(),
    description: issue.description ?? undefined,
    assigneeAgentId: issue.assigneeAgentId,
    status: "active",
  };
}

/** "Do this again every Monday": turn a task into a Paperclip routine on a schedule. */
export function RepeatTask({ issue }: { issue: Issue }) {
  const { company, agentById, toast } = useOfficeData();
  const open = useOffice((s) => s.open);
  const goFloor = useOffice((s) => s.goFloor);
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const [schedule, setSchedule] = useState("weekly");
  const [custom, setCustom] = useState("0 9 * * 1");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const cron = cronFor(schedule, custom);

  const create = useMutation({
    mutationFn: async () => {
      const routine = await api.createRoutine(company.id, routineFromTask(issue));
      if (cron) await api.addScheduleTrigger(routine.id, cron, tz, describeCron(cron));
      return routine;
    },
    onSuccess: (r) => {
      toast(`${r.title}: on the calendar, ${describeCron(cron).toLowerCase()}.`);
      qc.invalidateQueries({ queryKey: keys.routines(company.id) });
      setShown(false);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (!shown)
    return (
      <button className="px-btn small" onClick={() => setShown(true)} title="Do this task again on a schedule">
        🔁 Repeat
      </button>
    );
  return (
    <div className="px-card repeat-task" style={{ flexBasis: "100%", margin: "6px 0" }} aria-label="Repeat on a schedule">
      <div style={{ fontSize: 16 }}>
        A fresh copy of <b>{routineFromTask(issue).title}</b> for {agentById(issue.assigneeAgentId)?.name ?? "nobody yet (assign it later)"}, on a schedule ({tz}):
      </div>
      <div className="row">
        <select className="px-select" aria-label="How often" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
          {SCHEDULES.filter(([id]) => id !== "none").map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {schedule === "custom" && <input className="px-input" aria-label="Cron expression" placeholder="min hour day month weekday" value={custom} onChange={(e) => setCustom(e.target.value)} />}
      </div>
      <div className="row">
        <button className="px-btn small primary" disabled={!cron || create.isPending} onClick={() => create.mutate()}>
          📅 Put it on the calendar
        </button>
        <button className="px-btn small" onClick={() => setShown(false)}>Cancel</button>
        <button className="link-btn" style={{ fontSize: 14 }} onClick={() => (goFloor("basement"), open({ kind: "room", room: "routines" }))}>
          See all routines
        </button>
      </div>
    </div>
  );
}
