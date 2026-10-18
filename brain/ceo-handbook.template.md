---
name: ceo-handbook
description: The CEO's handbook for {{COMPANY}}. How the CEO works, the company's assets, and the house rules. Read it at the start of every task.
---

# CEO handbook: {{COMPANY}}

<!--
Template. Copy it into your private company repo (company/handbook/ceo-handbook.md), replace
the {{...}} placeholders and the example rows, then publish it to Paperclip:

    python scripts/handbook_sync.py push company/handbook/ceo-handbook.md

Keep it short: every employee loads this on every task. Facts and one-off decisions belong in
the second brain (pixel office → 📓 STUDY → Capture), not here.
-->

Read this at the start of every task. It is the CEO's standing instructions. If it conflicts
with a task description, the task wins for that task; if it conflicts with your role
instructions, this handbook wins. Only the CEO edits this file. To suggest a change, ask the
CEO on your task.

## Working style

- Small, reviewable changes over big ones. One concern per PR.
- Plans before large work: post the plan as a task comment and wait for approval when the
  work is more than a day of effort or touches architecture.
- "Done" means: built, tested (say which tests ran), and the task comment explains what
  changed and how it was verified.
- Ask the CEO with a Paperclip question when a decision is the CEO's to make (scope, cost,
  anything irreversible, anything that touches production). Decide everything else yourself.
- Keep task comments short and concrete. Tables beat paragraphs.

## Assets

| Asset | What it is | Where |
|---|---|---|
| {{PRODUCT}} | {{What it is, stack}} | {{Repo URL}} · Paperclip project "{{PRODUCT}}" (the team's working tree) |
| Virtual Office | The system you run in (Paperclip, the pixel office, the brain). | The folder Paperclip runs from (off-limits, see rules) |
| Second brain | Searchable long-term memory shared by the whole company (GBrain). | MCP tools named `gbrain` (recall, remember, search) |

Secrets (tokens, passwords, keys) live in the Paperclip Vault and are injected into your run.
Never paste a secret into a comment, a file, or the brain.

## House rules

1. **Off-limits folders.** Never edit the Virtual Office install ({{VIRTUAL_OFFICE_PATH}}) or
   anything under it, including `pixel-office`. If you find a problem there, describe it to the
   CEO on your task; do not fix it and do not create tasks to fix it.
2. **Team lead delegates.** The Manager plans and assigns; engineers build; QA verifies.
   Spread work across the engineers: do not give everything to one person while another sits idle.
3. **Approvals are real.** Never work past an approval gate, a gstack pending item, or an
   unanswered CEO question.
4. **No destructive git.** No force-push, no history rewrites, no deleting branches you did
   not create.
5. **Stay in budget.** If a task looks like it will cost far more than expected, stop and ask.

## Using the second brain

The brain remembers what the CEO has told the company and what the team has learned.

- **Before you start a task:** recall what is known about its subject (the repo, the
  feature, the people). Treat what you find as context; the task and this handbook come first.
- **When you learn something durable** (a decision, a gotcha, how a system really works):
  save it with `remember`, one fact per call, with the entity it is about and where you
  learned it. Use kind `fact`, `event`, `idea` or `belief` as appropriate.
- **Never save** secrets, personal data you were not asked to keep, or guesses stated as facts.
- **CEO decisions** (kind `commitment`) and **CEO preferences** (kind `preference`) are
  written by the CEO's office. Follow them; do not overwrite them.
