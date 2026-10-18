# Virtual Office

A personal "virtual company" of AI employees, run from a pixel-art office.

- **[Paperclip](https://github.com/paperclipai/paperclip)** is the company: org chart, tasks, approvals, budgets, heartbeats.
- **Pixel Office** (`pixel-office/`) is the CEO's UI: every Paperclip screen is a room in a pixel building.
- **Employees** are Claude Code or GitHub Copilot sessions (`adapters/copilot-local/` adds Copilot).
- **[gstack](https://github.com/garrytan/gstack)** gives employees role playbooks (`/qa`, `/review`, `/autoplan`…).
- **Second brain**: a CEO handbook every employee reads, plus searchable memory in [GBrain](https://github.com/garrytan/gbrain).

## Layout

| Path | What |
|---|---|
| `pixel-office/` | React + Vite front end on Paperclip's API; `brain-bridge.ts` links it to the brain |
| `adapters/copilot-local/` | Paperclip adapter that runs employees on GitHub Copilot CLI |
| `brain/ceo-handbook.template.md` | Template for your company's CEO handbook (copy into your private company repo) |
| `scripts/` | `gstack_equip.py`, `brain_equip.py` (equip employees), `handbook_sync.py` (handbook file ⇄ Paperclip), `make_icon.py` (desktop icon) |
| `launch-office.ps1` | One-click start: brain → Paperclip → pixel office, opens an app window |
| `start-*.ps1`, `stop-office.ps1` | Start or stop each piece |
| `assets/` | Desktop icon |

Not in git (see `.gitignore`): `.paperclip/` (company database), `.brain/` (tokens), `.tools/` (portable Node and Bun), `vendor/` (reference clones), and `company/`.

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
