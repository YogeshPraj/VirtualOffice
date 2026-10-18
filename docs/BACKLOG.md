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
- [x] **(P2) Richer task panel.** Priority, project, parent and sub-tasks, blockers, attachments.
- [x] **(P2) Work products.** PRs and branches an employee produced, listed on the task.

## Running the office
- [x] **(P2) Building status.** One place that checks Paperclip, the brain, the office server, each
  adapter, and the Claude/Copilot/az/gh sign-ins, with the fix for anything red.
- [x] **(P2) Brain import.** Bulk-import a folder of markdown notes or docs into the brain.
- [x] **(P3) Working hours.** Optionally pause the company outside set hours.
- [x] **(P3) First-run tour** of the rooms for a new install.

## Wave 2: daily-driver depth
- [x] **(P1) Bulk intake from queries.** Paste an Azure DevOps query link or WIQL ("my active items this
  sprint") or a GitHub issue search URL; preview every match and bring in the ones you tick.
- [x] **(P1) @mentions.** Autocomplete `@Name` in task comments; the mentioned employee is woken on that task.
- [x] **(P1) Ask an employee.** A quick question from the employee's panel that doesn't become a work task.
- [ ] **(P2) Task templates.** Saved blueprints (bug fix, PR review, spike, docs) that prefill title, details,
  assignee and priority on the board and intake desk.
- [ ] **(P2) Back up now.** Run the company export from Building status and show when the last backup was.
- [ ] **(P2) Finance: usage per employee.** Shifts, failures and tokens per employee over 24h / 7 days.
- [ ] **(P2) Try again.** When a task's last shift failed, show the error on the task and offer a one-click retry.
- [ ] **(P2) Search everything.** Search task threads and documents, not just titles.
- [ ] **(P3) Keyboard shortcuts.** `?` cheat sheet; `g b` board, `g i` inbox, `g t` today, `n` new task.
- [ ] **(P3) Weekly report.** "This week" in the daily report.
- [ ] **(P3) Night mode.** The office art dims when the company is closed or after hours.
