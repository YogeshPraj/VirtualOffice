import { useEffect } from "react";
import { useOffice, type RoomId } from "../state/officeStore";
import { useOfficeData } from "../state/officeData";
import { PxWindow } from "../ui/Window";
import { AgentPanel } from "./AgentPanel";
import { CeoPanel } from "./CeoPanel";
import { HrPanel } from "./HrPanel";
import { IssuePanel } from "./IssuePanel";
import { MeetingPanel } from "./MeetingPanel";
import { StudyPanel } from "./StudyPanel";
import { IntakePanel } from "./IntakePanel";
import { FinancePanel, FloorPanel, LobbyPanel, LoungePanel, SecurityPanel } from "./RoomPanels";
import {
  AdaptersPanel,
  OrgPanel,
  ProjectsPanel,
  RoutinesPanel,
  SettingsPanel,
  SkillsPanel,
  ToolsPanel,
  VaultPanel,
} from "./BasementPanels";

const ROOM_TITLES: Record<RoomId, string> = {
  lobby: "LOBBY",
  hr: "HR · HIRING",
  floor: "MAIN FLOOR",
  ceo: "CEO OFFICE",
  study: "CEO'S STUDY · SECOND BRAIN",
  intake: "INTAKE DESK · NEW WORK",
  meeting: "TASK BOARD",
  lounge: "#GENERAL",
  finance: "FINANCE",
  security: "SECURITY CAM",
  basement: "BASEMENT",
  settings: "MANAGEMENT · SETTINGS",
  org: "ORG CHART GALLERY",
  skills: "TRAINING LIBRARY · SKILLS",
  routines: "SCHEDULING ROOM · ROUTINES",
  projects: "WORKSHOP · PROJECTS",
  tools: "SWITCHBOARD · TOOLS",
  vault: "VAULT · SECRETS",
  adapters: "GENERATOR · ADAPTERS",
};

const ROOM_BODY: Record<RoomId, () => React.ReactElement> = {
  lobby: LobbyPanel,
  hr: HrPanel,
  floor: FloorPanel,
  ceo: CeoPanel,
  study: StudyPanel,
  intake: IntakePanel,
  meeting: MeetingPanel,
  lounge: LoungePanel,
  finance: FinancePanel,
  security: SecurityPanel,
  // The ground-floor basement is a staircase (handled by the scene), never a panel.
  basement: FloorPanel,
  settings: SettingsPanel,
  org: OrgPanel,
  skills: SkillsPanel,
  routines: RoutinesPanel,
  projects: ProjectsPanel,
  tools: ToolsPanel,
  vault: VaultPanel,
  adapters: AdaptersPanel,
};

export function PanelDock() {
  const panel = useOffice((s) => s.panel);
  const close = useOffice((s) => s.close);
  const { agentById, issues } = useOfficeData();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!panel) return null;

  let title = "";
  let body: React.ReactNode = null;
  if (panel.kind === "room") {
    title = ROOM_TITLES[panel.room];
    const Body = ROOM_BODY[panel.room];
    body = <Body />;
  } else if (panel.kind === "agent") {
    title = agentById(panel.agentId)?.name.toUpperCase() ?? "EMPLOYEE";
    body = <AgentPanel agentId={panel.agentId} />;
  } else {
    title = issues.find((i) => i.id === panel.issueId)?.identifier ?? "TASK";
    body = <IssuePanel issueId={panel.issueId} />;
  }

  return (
    <div className="panel-dock">
      <PxWindow title={title} onClose={close}>
        {body}
      </PxWindow>
    </div>
  );
}
