# Pixel Office

A pixel-art front end for a [Paperclip](https://github.com/paperclipai/paperclip) company. Paperclip stays the backend (agents, tasks, approvals, budgets); this app turns every screen into a place in the office.

## Run

1. `..\start-paperclip.ps1`: Paperclip API on http://127.0.0.1:3100
2. `..\start-office.ps1`: Pixel Office on http://127.0.0.1:5180

Vite proxies `/api` (including the live-events WebSocket) to Paperclip, so the browser stays same-origin. Paperclip's `local_trusted` mode needs no login.

## Where everything is

| Room | Paperclip feature |
|---|---|
| Lobby | Company info, goals (mission poster) |
| HR · Hiring | Hire agents (`POST /agent-hires`), staff roster |
| CEO office | Attention feed: agent questions (RPG dialogue), approvals |
| Meeting · Task board | Issues as sticky notes, create and assign |
| Main floor | One desk per agent; status drives behaviour |
| Lounge · #general | Comment and task activity as a chat channel |
| Finance | Spend vs budget, per-agent payroll |
| Security cam | Raw activity/audit log |
| Stairs ▼ B1 | Down to the machinery floor (below) |

**B1 (basement floor)**

| Room | Paperclip feature |
|---|---|
| Management | Company name, description, budget, hire-approval rule, open/close the office |
| Org chart gallery | Reporting tree; change who reports to whom |
| Training library | Company skills, catalog installs, per-agent skill assignment |
| Scheduling room | Routines with cron schedules, run now, pause/resume |
| Workshop | Projects, their code folder or git repo, lead and status |
| Switchboard | Tool connections with health, app gallery (OAuth sign-in opens classic) |
| Vault | Secrets: add, rotate, shred (values are write-only) |
| Generator | Adapters: switch on/off, live environment test |

Deep flows still open Paperclip's classic screen in a new tab: OAuth tool sign-in, Skill Studio, routine variables/webhooks, workspace runtime config, members/invites.

Agent behaviour (`src/office/behavior.ts`): `running` → typing at the desk · waiting on you → queued at the CEO door with `?` · `error` → `!` at the desk · `paused` → asleep · `pending_approval` → waiting in the lobby · idle → drifts between the desk, the lounge and the task board.

## Brain providers

Nothing is hard-coded to one AI vendor. HR lists every enabled Paperclip adapter that offers models (`GET /api/adapters`), loads its models from `/adapters/{type}/models`, clones the working config of an existing employee on the same adapter (or the adapter's schema defaults), and the repair kit shows the adapter's own environment-test diagnosis.

GitHub Copilot is provided by the external adapter in `adapters/copilot-local` (Paperclip's built-in Copilot profile is not enabled in the pinned release). Register it once with `POST /api/adapters/install` `{"packageName": "<abs path>", "isLocalPath": true}`; the plugin store persists it. Run `npm install` in that folder first.

## Second brain

The CEO's knowledge reaches every employee in two layers:

| Layer | What | Where |
|---|---|---|
| CEO handbook | Short, always-true rules: working style, assets, house rules. Loaded by every employee at the start of every task. | Paperclip company skill `ceo-handbook`; edit in 📓 STUDY → Handbook |
| Memory | Searchable facts, decisions and learnings that grow over time. | GBrain (local PGLite at `~/.gbrain`), one shared server on 127.0.0.1:3131 (`start-brain.ps1`) |

- Employees reach the brain over MCP: registered for Claude Code (`claude mcp`) and GitHub Copilot CLI (`copilot mcp`).
- The pixel office talks to it only through `brain-bridge.ts` (Vite middleware at `/brain/*`), so the CEO token in `../.brain/` never reaches the browser. The bridge refuses text that looks like a secret.
- Every answer the CEO gives in the CEO office (questions, plan picks, approvals) is saved as a decision (`commitment`).
- `../scripts/brain_equip.py` gives employees the handbook skill and a "Company knowledge" section in their instructions; re-run it after new hires.

## Credits

Character sprite templates are ported from [agent-virtual-office](https://github.com/KbWen/agent-virtual-office) (MIT); see `THIRD_PARTY_LICENSE_agent-virtual-office.txt`.
