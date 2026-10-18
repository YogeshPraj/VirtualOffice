# Virtual Office

A personal "virtual company" of AI employees, run from a pixel-art office.

- **[Paperclip](https://github.com/paperclipai/paperclip)** is the company: org chart, tasks, approvals, budgets, heartbeats.
- **Pixel Office** (`pixel-office/`) is the CEO's UI: every Paperclip screen is a room in a pixel building.
- **Employees** are Claude Code or GitHub Copilot sessions (`adapters/copilot-local/` adds Copilot).
- **[gstack](https://github.com/garrytan/gstack)** gives employees role playbooks (`/qa`, `/review`, `/autoplan`…).
- **Second brain**: a CEO handbook every employee reads, plus searchable memory in [GBrain](https://github.com/garrytan/gbrain).

## What the office does

- **Bring in work**: the 📥 Intake desk turns Azure DevOps work items, GitHub issues/PRs or any link into tasks for the team lead; tasks keep a live link to the source, and **Report back** posts the team's summary on the ADO/GitHub item (after you confirm).
- **Run the work**: a drag-and-drop task board with search and filters; task panels with documents (with revisions), work products (PRs, branches, commits), sub-tasks, blockers and attachments.
- **Watch the team**: look over an employee's shoulder at their live run (or replay their last shift); 🔔 desktop alerts when someone needs you, a task hits review or an employee errors.
- **Stay on top**: 📰 Today (a copyable stand-up report), 🟢 Building status (every service and sign-in, with fixes), Ctrl+K to jump anywhere.
- **Company memory**: the 📓 Study holds the CEO handbook and the brain; import a folder of notes in one go.
- **Office hours**: optionally close the company outside working hours; it reopens itself in the morning.

## Layout

| Path | What |
|---|---|
| `pixel-office/` | React + Vite front end on Paperclip's API. Server-side helpers run in the Vite server: `brain-bridge.ts` (brain + note import), `intake-bridge.ts` (ADO/GitHub via `az`/`gh`), `status-bridge.ts` (building status), `working-hours.ts`, `recovery-blockers.ts` |
| `adapters/copilot-local/` | Paperclip adapter that runs employees on GitHub Copilot CLI |
| `brain/ceo-handbook.template.md` | Template for your company's CEO handbook (copy into your private company repo) |
| `scripts/` | `gstack_equip.py`, `brain_equip.py` (equip employees), `handbook_sync.py` (handbook file ⇄ Paperclip), `make_icon.py` (desktop icon) |
| `launch-office.ps1` | One-click start: brain → Paperclip → pixel office, opens an app window |
| `start-*.ps1`, `stop-office.ps1` | Start or stop each piece |
| `assets/` | Desktop icon |

Not in git (see `.gitignore`): `.paperclip/` (company database), `.brain/` (tokens), `.office/` (office settings), `.tools/` (portable Node and Bun), `vendor/` (reference clones), and `company/`.

## Your company's data stays private

This repo is the product only. Everything specific to *your* company (handbook, agent
instructions, projects) belongs in a **separate private repo** checked out at `company/`
(git-ignored here). Suggested contents:

- `company/handbook/ceo-handbook.md`: your handbook, from `brain/ceo-handbook.template.md`. Publish with `python scripts/handbook_sync.py push company/handbook/ceo-handbook.md`.
- `company/paperclip-export/`: refresh with `pwsh scripts\export-company.ps1`, then commit in `company/` (secret values are never exported).

The live databases (`.paperclip/`, `~/.gbrain`) are never committed anywhere; back them up separately.

## Setup on a new machine (Windows)

Needs Git for Windows and PowerShell 7 (`pwsh`). Claude Code CLI and/or GitHub Copilot CLI for the employees.

```powershell
git clone https://github.com/YogeshPraj/VirtualOffice.git
cd VirtualOffice
pwsh -ExecutionPolicy Bypass -File .\setup.ps1
```

`setup.ps1` is safe to re-run; finished steps are skipped. It:

1. downloads portable Node 24 and Bun into `.tools\` (checksum-verified; system Node/Bun untouched),
2. installs the npm packages,
3. installs gstack into `~\.claude\skills\gstack` (no changes to your global Claude settings),
4. installs GBrain, creates a local brain in `~\.gbrain` and mints its tokens into `.brain\`,
5. connects the brain to Claude Code and Copilot CLI (user-level MCP),
6. puts a **Virtual Office** icon on the desktop.

Then sign in once (`claude auth login` and/or `copilot login`) and double-click the icon. The
first start takes a minute or two. Create a company in the pixel office, or import yours from
your private company repo (`company/`). Write your handbook from the template, publish it with
`python scripts\handbook_sync.py push <file>`, then run `python scriptsrain_equip.py`.

`-SkipGlobal` sets up only this folder (runtimes and packages) without touching your profile.

Paperclip's version is pinned in `start-paperclip.ps1`; upgrade on purpose.

## Licenses

Original code in this repository: [MIT](LICENSE). Character sprite templates are ported from agent-virtual-office (MIT, see `pixel-office/THIRD_PARTY_LICENSE_agent-virtual-office.txt`).
Third-party components and their terms: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
