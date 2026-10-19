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
- [x] **(P2) Task templates.** Saved blueprints (bug fix, PR review, spike, docs) that prefill title, details,
  assignee and priority on the board and intake desk.
- [x] **(P2) Back up now.** Run the company export from Building status and show when the last backup was.
- [x] **(P2) Finance: usage per employee.** Shifts, failures and tokens per employee over 24h / 7 days.
- [x] **(P2) Try again.** When a task's last shift failed, show the error on the task and offer a one-click retry.
- [x] **(P2) Search everything.** Search task threads and documents, not just titles.
- [x] **(P3) Keyboard shortcuts.** `?` cheat sheet; `g b` board, `g i` inbox, `g t` today, `n` new task.
- [x] **(P3) Weekly report.** "This week" in the daily report.
- [x] **(P3) Night mode.** The office art dims when the company is closed or after hours.

## Wave 3: running the team day to day
- [x] **(P1) Watched queries.** Save an ADO query or GitHub search; the office checks it every few minutes and
  puts new matches on the intake desk (with an alert), so new work assigned to you shows up by itself.
- [x] **(P1) Source drift.** When a linked ADO/GitHub item is closed, reopened or reassigned outside the office,
  flag it on the task and the board.
- [x] **(P2) Employee instructions.** Read and edit an employee's instructions (their AGENTS.md bundle) from
  their desk, with history and restore.
- [x] **(P2) Task history.** A timeline on each task: created, status changes, assignments, comments and shifts.
- [x] **(P2) Bulk edit on the board.** Select several notes; assign, set priority, change status or cancel at once.
- [x] **(P2) Workload.** Each employee's queue, what they're on now and how long they've been idle, with a
  one-click reassign to balance the team.
- [x] **(P2) Goals with progress.** Link tasks to the mission poster's goals and see progress bars.
- [x] **(P3) Report as a file.** Download the daily/weekly report as Markdown.

## Wave 4: coming back to the office
- [x] **(P1) Since you were away.** When you come back after a while, a briefing of what changed: finished,
  new questions for you, failed shifts, new intake matches; changed notes glow on the board.
- [x] **(P2) Saved board views.** Name a filter ("My ADO bugs", "QA queue") and switch to it in one click.
- [x] **(P2) Comment drafts.** Unsent comments and questions survive closing the panel.
- [x] **(P2) Employee scorecard.** On each desk: tasks done, typical time to finish, failure rate and
  review bounce-backs over 30 days.
- [x] **(P2) Cycle time in reports.** How long tasks took from start to done, and the slowest ones.
- [x] **(P2) Task map.** A picture of a task's sub-tasks and what blocks what.
- [x] **(P2) Back up office settings.** Templates, watches, working hours and saved views go into the private
  company repo with each backup.
- [x] **(P3) Office sounds.** Optional soft typing while someone works and a chime when a task is done.

## Wave 5: deciding faster
- [x] **(P1) Review queue.** Everything ready for your review in one place: tasks in review with their work
  products, documents and latest update; approve (done), send back with a note, or open. Keys j/k, a, s.
- [x] **(P1) Hiring presets.** Ready-made roles (QA, backend, frontend, docs writer, reviewer) with sensible
  instructions, title and capabilities: one click to post the job.
- [x] **(P2) Undo.** After moving, reassigning or cancelling a task, an Undo button for a few seconds.
- [x] **(P2) Focus list.** Pin up to five tasks as your priorities; they lead the board and the Today report.
- [x] **(P2) Share a task.** Copy or download a task (details, thread, documents, links) as Markdown.
- [x] **(P2) Budget alerts.** A desktop alert when an employee passes 80% of their monthly budget.
- [x] **(P3) Keyboard board.** Move between sticky notes with the arrow keys, Enter to open, and visible focus.

## Wave 6: keeping up
- [x] **(P1) Office updates.** The office checks GitHub for a newer version and updates itself in one click
  (fast-forward only), saying when setup.ps1 must run again.
- [x] **(P1) Due dates.** Give a task a due date (or take it from the ADO item); overdue and due-soon badges on
  the board, and an alert the day before.
- [x] **(P1) Self-healing services.** If Paperclip or the brain stops (sleep, crash), the office server restarts
  it by itself and tells you.
- [x] **(P2) Snooze.**** Put an inbox item off until later today, tomorrow morning or next week.
- [x] **(P2) Quick replies.** One-click answers ("Go ahead", "Ship it", "Hold until I review") in threads
  and the review room; editable.
- [x] **(P2) What's new.** After an update, a short list of what changed in the office.
- [x] **(P2) Stand-up reminder.** At the start of the working day, an alert that today's report is ready.
- [x] **(P3) Text size.** Make the office's text bigger or smaller.

## Wave 7: seeing what's going on
- [x] **(P1) Gone quiet.** Open tasks with no activity for too long (in progress 1 day, in review 1 day, blocked
  2 days, to do 3 days) listed in Today, with a one-click nudge.
- [x] **(P2) Speech bubbles.** Employees in the office show a short bubble of what they're doing right now.
- [x] **(P2) Brain in Ctrl+K.** The palette also searches the second brain's memory.
- [x] **(P2) Per-item assignee at intake.** When bringing in several items, choose who gets each one.
- [x] **(P2) Checklist progress.** "- [ ]" checklists in a task's details show as a progress bar on its note.
- [x] **(P2) Shift timeline.** Today's shifts per employee as a timeline in the security room.
- [x] **(P3) Dark panels.** A darker panel theme for evenings (or follow Windows).

## Wave 8: always on, faster hands
- [x] **(P1) Office supervisor.** A small background watcher keeps the office server itself running (the
  in-office self-healing can't restart the server it lives in).
- [x] **(P2) Start with Windows.** Optionally open the office when you sign in.
- [x] **(P2) Palette actions.** Run office actions from Ctrl+K: back up, check for updates, close or open the
  office, dark panels, alerts.
- [x] **(P2) Paste screenshots.** Paste an image into a comment; it's attached to the task and shown inline.
- [x] **(P2) Long threads.** Older comments fold away; filter to updates from employees only.
- [x] **(P2) Board to CSV.** Export the board (or the filtered view) as a spreadsheet.
- [x] **(P3) Celebrate.** A little confetti when a goal is achieved or the focus list is all done.

## Wave 9: fixing things in place
- [x] **(P1) Edit tasks in place.** Change a task's title and details from its panel (with a preview).
- [x] **(P1) Leak watch.** Scan task threads and documents for pasted secrets (tokens, keys, passwords) and
  flag them with where they are, so they can be removed and rotated.
- [x] **(P2) Follow-up tasks.** From any task, one click to create a linked follow-up (or a copy).
- [x] **(P2) Recently viewed.** Ctrl+K opens with the tasks and rooms you looked at last.
- [x] **(P2) Review checklist.** The review room shows the task's checklist, so you can see what's ticked.
- [x] **(P2) Connection banner.** A clear banner when Paperclip can't be reached, saying it's being restarted.
- [x] **(P3) Employee of the week.** The lobby wall honours whoever finished the most this week.
