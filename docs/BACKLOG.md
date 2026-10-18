# Virtual Office backlog

Gap analysis of what a "run my day with an AI team" app needs, against what the pixel office
does today. Worked top to bottom; each item is implemented, verified in the browser, committed
and pushed, then ticked here.

Legend: [ ] todo · [x] done · (P1) daily-driver gap · (P2) important · (P3) polish

## Work intake: getting real work to the team
- [x] **(P1) Intake desk.** Paste Azure DevOps work-item links, GitHub issue/PR links or any URL
  (one per line) plus optional instructions. ADO items are fetched with the CEO's own `az` login
  (title, type, state, description, acceptance criteria, repro steps, tags); GitHub with `gh`.
  Creates one task per item (or one task for all), assigned to the Manager for triage or straight
  to an employee, in a chosen project, with priority. Skips items that already have a task.
- [x] **(P1) Linked work.** A task shows the ADO/GitHub item it came from (type, state, link), and the
  board shows a badge, so the CEO can jump back to the source.
- [x] **(P2) Report back to ADO.** Opt-in per task: when a task is done, post the team's summary as a
  comment on the source work item (an outward action, so it always asks the CEO first).

## Knowing what's going on
- [x] **(P1) Desktop notifications.** A Windows notification (and optional sound) when someone starts
  waiting on the CEO, when a task needs review, and when an employee errors. Toggle in the HUD.
- [x] **(P1) Over-the-shoulder view.** Click a working employee to watch their live run output.
- [x] **(P1) Task documents.** Plans and specs agents attach to tasks (e.g. the Manager's `plan`) are
  readable in the task panel, with revisions.
- [x] **(P2) Daily report.** "Today at the office": done, in progress, blocked, waiting on you,
  spend; copy as text for a stand-up.

## Managing work
- [x] **(P2) Board: drag and drop** to change status; filter by project, employee, priority; search.
- [x] **(P2) Command palette (Ctrl+K).** Jump to any task, employee or room; quick-create a task.
- [ ] **(P2) Richer task panel.** Priority, project, parent and sub-tasks, blockers, attachments.
- [ ] **(P2) Work products.** PRs and branches an employee produced, listed on the task.

## Running the office
- [ ] **(P2) Building status.** One place that checks Paperclip, the brain, the office server, each
  adapter, and the Claude/Copilot/az/gh sign-ins, with the fix for anything red.
- [ ] **(P2) Brain import.** Bulk-import a folder of markdown notes or docs into the brain.
- [ ] **(P3) Working hours.** Optionally pause the company outside set hours.
- [ ] **(P3) First-run tour** of the rooms for a new install.
