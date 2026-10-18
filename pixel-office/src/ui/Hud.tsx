import { useEffect, useState } from "react";
import type { Company } from "../api/types";
import { useDashboard, useToolConnections } from "../api/hooks";
import { useOffice } from "../state/officeStore";
import { CLASSIC_UI } from "./Window";
import { BrainSwitcher } from "./BrainSwitcher";
import { useNotificationPref } from "./useNotifications";
import { LEVEL_ICON, useBuildingStatus, worstLevel } from "../panels/StatusPanel";

export function Hud({ company, attentionCount, companies, onSwitch }: {
  company: Company;
  attentionCount: number;
  companies: Company[];
  onSwitch: (id: string) => void;
}) {
  const live = useOffice((s) => s.live);
  const open = useOffice((s) => s.open);
  const floor = useOffice((s) => s.floor);
  const goFloor = useOffice((s) => s.goFloor);
  const { data: dash } = useDashboard(company.id);
  // An AI connection that needs a fresh sign-in stops every employee, so it gets a loud banner.
  const { data: conns } = useToolConnections(company.id);
  const brokenAi = conns?.find((c) => c.connectionPurpose === "ai" && c.enabled && c.healthStatus === "error");
  const notify = useNotificationPref();
  const building = useBuildingStatus();
  const worst = worstLevel(building.data?.checks);
  const problems = building.data?.checks.filter((c) => c.level !== "ok").length ?? 0;
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="hud">
      <span className="brand">▣ {company.name.toUpperCase()}</span>
      {companies.length > 1 && (
        <select className="px-select" style={{ width: "auto", margin: 0, padding: "2px 6px" }} aria-label="Switch company" value={company.id} onChange={(e) => onSwitch(e.target.value)}>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      <span className="stat" title={live ? "Live updates connected" : "Reconnecting to live updates"}>
        <span className={`live-dot ${live ? "on" : ""}`} />
        {live ? "LIVE" : "OFFLINE"}
      </span>
      {dash && (
        <>
          <span className="stat">👥 {dash.agents.active + dash.agents.running + dash.agents.paused + dash.agents.error}</span>
          <span className="stat">⌨ {dash.agents.running} working</span>
          <span className="stat">📌 {dash.tasks.open + dash.tasks.inProgress} open</span>
          {dash.tasks.blocked > 0 && <span className="stat" style={{ color: "#ff8a8a" }}>⛔ {dash.tasks.blocked} blocked</span>}
          <span className="stat">🪙 ${(dash.costs.monthSpendCents / 100).toFixed(2)}</span>
        </>
      )}
      {company.status === "paused" && (
        <span className="stat" style={{ color: "#ffd479" }} title="The company is closed: nobody picks up new work. Reopen it in B1 · Management.">
          🌙 CLOSED
        </span>
      )}
      {brokenAi && (
        <a
          className="px-btn small bad"
          href={`${CLASSIC_UI}/${company.issuePrefix}/apps/${brokenAi.id}/permissions`}
          target="_blank"
          rel="noreferrer"
          title={brokenAi.healthMessage ?? "AI sign-in needs attention"}
        >
          ⚠ {brokenAi.name}: SIGN IN AGAIN ↗
        </a>
      )}
      <span className="spacer" />
      <button
        data-tour="building"
        className={`px-btn small ${worst === "bad" ? "bad" : ""}`}
        onClick={() => open({ kind: "room", room: "status" })}
        title={worst === "ok" ? "Everything the office needs is running" : `${problems} thing(s) need attention`}
      >
        {worst ? LEVEL_ICON[worst] : "⏳"} BUILDING
      </button>
      <button data-tour="palette" className="px-btn small" onClick={() => window.dispatchEvent(new Event("pixel-office:palette"))} title="Jump anywhere (Ctrl+K). Press ? for all shortcuts">
        🔎 Ctrl+K
      </button>
      <BrainSwitcher />
      {notify.supported && (
        <button
          className={`px-btn small ${notify.on ? "primary" : ""}`}
          onClick={notify.toggle}
          onContextMenu={(e) => {
            e.preventDefault();
            notify.toggleSound();
          }}
          title={
            notify.permission === "denied"
              ? "Notifications are blocked for this site in the browser settings"
              : `Desktop alerts ${notify.on ? "on" : "off"} (sound ${notify.sound ? "on" : "off"}; right-click to toggle sound)`
          }
        >
          {notify.on ? (notify.sound ? "🔔" : "🔕") : "🔇"} ALERTS
        </button>
      )}
      <button data-tour="stairs" className="px-btn small" onClick={() => goFloor(floor === "ground" ? "basement" : "ground")} title="Take the stairs">
        {floor === "ground" ? "▼ B1" : "▲ GROUND"}
      </button>
      <button data-tour="inbox" className={`px-btn small ${attentionCount ? "bad" : ""}`} onClick={() => open({ kind: "room", room: "ceo" })}>
        ☎ {attentionCount ? `${attentionCount} NEED YOU` : "INBOX"}
      </button>
      <button data-tour="intake" className="px-btn small" onClick={() => open({ kind: "room", room: "intake" })} title="Bring in work: ADO, GitHub or any link">
        📥 INTAKE
      </button>
      <button data-tour="today" className="px-btn small" onClick={() => open({ kind: "room", room: "report" })} title="Today at the office: a stand-up summary">
        📰 TODAY
      </button>
      <button data-tour="study" className="px-btn small" onClick={() => open({ kind: "room", room: "study" })} title="Your second brain: handbook and memory">
        📓 STUDY
      </button>
      <button className="px-btn small" onClick={() => open({ kind: "room", room: "hr" })}>+ HIRE</button>
      <button data-tour="task" className="px-btn small" onClick={() => open({ kind: "room", room: "meeting" })}>📌 TASK</button>
      <a className="px-btn small" href={CLASSIC_UI} target="_blank" rel="noreferrer" title="Open Paperclip's classic UI">
        CLASSIC ↗
      </a>
      <span className="stat">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </header>
  );
}
