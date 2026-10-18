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
- `company/paperclip-export/`: `npx paperclipai company export <id> --out ./company/paperclip-export --include company,agents,skills,projects` (secret values are never exported).

The live databases (`.paperclip/`, `~/.gbrain`) are never committed anywhere; back them up separately.

## Setup on a new machine (Windows)

1. Portable runtimes in `.tools/`: Node 24.11+ in `.tools/node`, Bun 1.4+ in `.tools/bun` (also copy `bun.exe` to `bunx.exe`).
2. `cd pixel-office && npm install`; `cd adapters/copilot-local && npm install`.
3. Claude Code CLI signed in (`claude auth login`); optional GitHub Copilot CLI signed in.
4. gstack: `git clone --depth 1 https://github.com/garrytan/gstack ~/.claude/skills/gstack` then `./setup --host claude --no-plan-tune-hooks --no-timeline-stop-hook` with `.tools/bun` on PATH.
5. GBrain: `bun install -g github:garrytan/gbrain`, `gbrain init --pglite --no-embedding`, mint tokens into `.brain/` (`gbrain auth create employees --scopes read,write`, same for `ceo-office`), then register `http://127.0.0.1:3131/mcp` with `claude mcp add --transport http --scope user …` and `copilot mcp add --transport http …`.
6. Double-click `launch-office.ps1` (or a shortcut to it). First run: create the company in the pixel office, hire in HR.
7. Write your handbook from the template and `python scripts/handbook_sync.py push <file>`.
8. `python scripts/brain_equip.py` after hiring; `python scripts/gstack_equip.py <name>` per employee.

Paperclip's version is pinned in `start-paperclip.ps1`; upgrade on purpose.

## Licenses

Original code in this repository: see `LICENSE` (if present; otherwise all rights reserved by the owner).
Third-party components and their terms: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
