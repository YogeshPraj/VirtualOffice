import type { AgentRole } from "../api/types";

export interface HirePreset {
  id: string;
  icon: string;
  label: string;
  role: AgentRole;
  title: string;
  skills: string;
  budget: string;
  /** Appended to the new employee's AGENTS.md as their role playbook. */
  playbook: string;
}

export const HIRE_PRESETS: HirePreset[] = [
  {
    id: "qa",
    icon: "🧪",
    label: "QA engineer",
    role: "qa",
    title: "QA Engineer",
    skills: "Verifies work against acceptance criteria, reproduces bugs with exact steps, writes and runs automated tests, and blocks anything that isn't ready.",
    budget: "20",
    playbook: [
      "- Start from the task's acceptance criteria; if there are none, write them in the thread first.",
      "- Reproduce before you judge: record exact steps, expected vs actual, and environment.",
      "- Prefer an automated test that fails before the fix and passes after.",
      "- Report PASS or FAIL per criterion with evidence (output, screenshots). Never pass on 'looks fine'.",
      "- Use gstack /qa or /qa-only for browser checks when the task is a UI.",
    ].join("\n"),
  },
  {
    id: "backend",
    icon: "🛠",
    label: "Backend developer",
    role: "engineer",
    title: "Backend Engineer",
    skills: "APIs, services, data and background jobs. Small, tested changes; explains trade-offs; keeps the build green.",
    budget: "30",
    playbook: [
      "- Read the repo's CLAUDE.md / README first and follow its conventions.",
      "- Plan in the thread for anything over a day of work, then implement in small steps.",
      "- Every change ships with tests; run the full suite before saying done.",
      "- Link the PR or commit as a work product and summarise what changed and why.",
    ].join("\n"),
  },
  {
    id: "frontend",
    icon: "🎨",
    label: "Frontend developer",
    role: "engineer",
    title: "Frontend Engineer",
    skills: "UI components, state, accessibility and performance in the web app. Matches the existing design and checks the result in a browser.",
    budget: "30",
    playbook: [
      "- Match the existing components, spacing and naming; don't invent a new style.",
      "- Check your change in a real browser (gstack /browse) at desktop and phone width.",
      "- Keyboard and screen-reader access are part of done: labels, focus, contrast.",
      "- Attach before/after screenshots to the task.",
    ].join("\n"),
  },
  {
    id: "reviewer",
    icon: "🔍",
    label: "Code reviewer",
    role: "engineer",
    title: "Code Reviewer",
    skills: "Reviews pull requests for correctness, tests, security and clarity. Findings ranked by severity with concrete fixes.",
    budget: "15",
    playbook: [
      "- Review the diff, not the description: check behaviour, edge cases, tests and secrets.",
      "- Rank findings: must-fix, should-fix, nit. Give the fix, not just the problem.",
      "- Use gstack /review for a structured pass.",
      "- Approve only when every must-fix is resolved.",
    ].join("\n"),
  },
  {
    id: "docs",
    icon: "📝",
    label: "Docs writer",
    role: "researcher",
    title: "Technical Writer",
    skills: "Writes and maintains READMEs, guides and release notes that match the code. Clear, short, with examples that run.",
    budget: "10",
    playbook: [
      "- Read the code before writing about it; every example must run as written.",
      "- Short sentences, task-first headings, no marketing tone.",
      "- Put docs where readers look (README, docs/), and link new pages from an index.",
    ].join("\n"),
  },
  {
    id: "devops",
    icon: "🚀",
    label: "DevOps",
    role: "devops",
    title: "DevOps Engineer",
    skills: "CI/CD, environments, builds and deployments. Keeps pipelines green and asks before anything risky or irreversible.",
    budget: "20",
    playbook: [
      "- Never run destructive or production-affecting commands without the CEO's explicit approval in the thread.",
      "- Prefer reversible changes; write the rollback step down before you act.",
      "- Keep secrets in the Vault; never paste them into tasks, logs or the brain.",
    ].join("\n"),
  },
];

const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Katherine", "Dennis", "Barbara", "Ken", "Radia", "Edsger", "Frances", "Tim", "Hedy", "Donald", "Annie"];

/** A first name nobody in the office has yet. */
export function freeName(taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  return NAMES.find((n) => !used.has(n.toLowerCase())) ?? `${NAMES[0]} ${taken.length + 1}`;
}

const BEGIN = "<!-- role-playbook:begin -->";
const END = "<!-- role-playbook:end -->";

/** Add (or replace) the role playbook section in an AGENTS.md. */
export function withPlaybook(agentsMd: string, preset: Pick<HirePreset, "title" | "playbook">): string {
  const block = `${BEGIN}\n## How you work as ${preset.title}\n\n${preset.playbook}\n${END}`;
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  return re.test(agentsMd) ? agentsMd.replace(re, block) : `${agentsMd.trimEnd()}\n\n${block}\n`;
}
