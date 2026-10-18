import { useEffect, useState } from "react";
import type { Company } from "./api/types";
import { useAgents, useAttention, useCompanies, useIssues, useLiveEvents } from "./api/hooks";
import { OfficeScene } from "./office/OfficeScene";
import { BasementScene } from "./office/BasementScene";
import { Onboarding } from "./Onboarding";
import { PanelDock } from "./panels/PanelDock";
import { OfficeDataProvider } from "./state/officeData";
import { useOffice } from "./state/officeStore";
import { Hud } from "./ui/Hud";
import { PxWindow } from "./ui/Window";
import { useOfficeNotifications } from "./ui/useNotifications";
import { ErrorBar } from "./ui/ErrorBar";
import { CommandPalette } from "./ui/CommandPalette";
import { Tour } from "./ui/Tour";
import { Shortcuts } from "./ui/Shortcuts";
import { useOfficeMood } from "./office/mood";

const COMPANY_KEY = "pixel-office:company";

function readSaved(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<string | null>(readSaved);

  useEffect(() => {
    try {
      if (companyId) localStorage.setItem(COMPANY_KEY, companyId);
    } catch {
      /* storage unavailable: fine, we just won't remember */
    }
  }, [companyId]);

  if (companies.isLoading) return <Splash text="Unlocking the building…" />;
  if (companies.error) {
    return (
      <Splash
        text="Can't reach Paperclip. Is it running? Start it with start-paperclip.ps1 and refresh."
        detail={(companies.error as Error).message}
      />
    );
  }
  const list = companies.data ?? [];
  if (list.length === 0) {
    return <Onboarding onCreated={(c) => setCompanyId(c.id)} />;
  }
  const company = list.find((c) => c.id === companyId) ?? list[0];
  return <Office key={company.id} company={company} companies={list} onSwitch={setCompanyId} />;
}

function Office({ company, companies, onSwitch }: { company: Company; companies: Company[]; onSwitch: (id: string) => void }) {
  useLiveEvents(company.id);
  const agents = useAgents(company.id);
  const issues = useIssues(company.id);
  const attention = useAttention(company.id);
  const open = useOffice((s) => s.open);
  const floor = useOffice((s) => s.floor);

  // A brand-new company has nobody in it yet: walk the CEO straight to HR.
  useEffect(() => {
    if (agents.data && agents.data.length === 0) open({ kind: "room", room: "hr" });
  }, [agents.data, open]);

  const value = {
    company,
    agents: agents.data ?? [],
    issues: issues.data ?? [],
    attention: attention.data?.items ?? [],
  };
  const mood = useOfficeMood(company);
  useOfficeNotifications(value.attention, value.agents, value.issues, !!(agents.data && issues.data && attention.data));

  return (
    <OfficeDataProvider value={value}>
      <div className="app">
        <Hud company={company} attentionCount={value.attention.length} companies={companies} onSwitch={onSwitch} />
        <ErrorBar />
        <main className={`stage mood-${mood.mood}`}>
          {mood.mood === "night" && (
            <div className="night-sign" role="status">
              🌙 {mood.why}
              {mood.reopens ? ` · opens ${new Date(mood.reopens).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : " · nobody picks up new work"}
            </div>
          )}
          {floor === "ground" ? (
            <OfficeScene company={company} agents={value.agents} issues={value.issues} attention={value.attention} />
          ) : (
            <BasementScene company={company} />
          )}
          <PanelDock />
        </main>
        <CommandPalette />
        <Tour />
        <Shortcuts />
      </div>
    </OfficeDataProvider>
  );
}

function Splash({ text, detail }: { text: string; detail?: string }) {
  return (
    <div className="exterior">
      <PxWindow title="PIXEL OFFICE">
        <p>{text}</p>
        {detail && <p className="muted">{detail}</p>}
      </PxWindow>
    </div>
  );
}
