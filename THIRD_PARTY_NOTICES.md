# Third-party notices

This repository contains original work (the pixel office, the Copilot adapter, the scripts and
launchers) plus a small amount of code ported from one MIT-licensed project. Everything else
it uses is installed at runtime and is **not** included in this repository.

Licenses were checked on 2026-10-18 against each project's repository and every installed
npm package's `package.json`.

## Included in this repository

| Component | Where | License | Obligation |
|---|---|---|---|
| [agent-virtual-office](https://github.com/KbWen/agent-virtual-office) © 2026 KbWen | Character sprite templates, walk frames and expressions ported into `pixel-office/src/pixel/sprite.ts` | MIT | Keep the copyright and license notice: `pixel-office/THIRD_PARTY_LICENSE_agent-virtual-office.txt` (done; credited in the file header and README) |

## Installed at runtime (not in this repository)

| Component | How it's used | License |
|---|---|---|
| [Paperclip](https://github.com/paperclipai/paperclip) | Backend: run with `npx paperclipai@<version>`; the pixel office calls its REST API | MIT |
| `@paperclipai/adapter-utils` | npm dependency of `adapters/copilot-local` | MIT |
| [gstack](https://github.com/garrytan/gstack) | Claude Code skills installed in `~/.claude/skills/gstack`; employees follow its playbooks | MIT |
| [GBrain](https://github.com/garrytan/gbrain) | Second brain, installed with `bun install -g github:garrytan/gbrain` | MIT |
| [Bun](https://github.com/oven-sh/bun) | Runtime for gstack and GBrain (portable copy in `.tools/bun`, git-ignored) | MIT; the binary also contains LGPL-licensed components (JavaScriptCore). Not redistributed here |
| [Node.js](https://nodejs.org) | Runtime for Paperclip and the pixel office (portable copy in `.tools/node`, git-ignored) | MIT and bundled third-party licenses. Not redistributed here |
| Playwright / Chromium | Headless browser downloaded by gstack for QA runs | Apache-2.0 / BSD-3-Clause. Not redistributed here |

### npm dependencies

`pixel-office` (107 packages incl. transitive): MIT 93, ISC 7, Apache-2.0 3, OFL-1.1 2, BSD-3-Clause 1, CC-BY-4.0 1.
`adapters/copilot-local` (30 packages): MIT 20, Apache-2.0 9, ISC 1. No copyleft licenses in either tree.

The two **OFL-1.1** packages are the pixel fonts `@fontsource/press-start-2p` and `@fontsource/vt323`.
OFL lets you use and bundle the fonts freely (including in a built `dist/`); if you ever
distribute the font files themselves, keep their OFL license with them, and don't sell the fonts
on their own. `npm run build` output bundles them; their license ships inside the npm packages.

The **CC-BY-4.0** package is build-tool data (`caniuse-lite`, via Vite) and is not shipped in the app.

## Services used (terms of service, not open-source licenses)

These are proprietary services used under their own terms by the person running the office.
Nothing from them is included in this repository.

| Service | Used for | Terms |
|---|---|---|
| Claude Code (Anthropic) | AI employees on the `claude_local` adapter, via the owner's Claude subscription | Anthropic's consumer / commercial terms and usage policy |
| GitHub Copilot CLI (GitHub) | AI employees on the `copilot_local` adapter | GitHub Copilot terms (and your organization's Copilot policy if your seat is employer-provided) |
| GitHub | Hosting this repository and the products the team works on | GitHub Terms of Service |
