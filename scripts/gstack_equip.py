"""Equip a Paperclip employee with gstack.

Adds (or refreshes) a marked "gstack playbook" section in the agent's AGENTS.md and sets
GSTACK_SESSION_KIND=unattended in its adapter env, keeping any env vars already there.
Re-running is safe: the marked section is replaced, never duplicated.

    python scripts/gstack_equip.py QA             # equip one employee by name
    python scripts/gstack_equip.py QA --dry-run   # show what would change
    python scripts/gstack_equip.py QA --remove    # take gstack away again
"""

import argparse
import json
import sys
import urllib.request

API = "http://127.0.0.1:3100/api"
BEGIN = "<!-- gstack:begin -->"
END = "<!-- gstack:end -->"

# Role → the gstack commands that employee should reach for. Keep these short: the skills
# themselves carry the method; this only tells the agent when to use which one.
KITS = {
    "qa": [
        "Verifying a feature or fix in a running web app: run `/qa-only <url>` (report only).",
        "Use `/qa <url>` only when the task explicitly asks you to fix test-side problems; "
        "it edits code, and you do not fix production code.",
        "Before testing an engineer's change, skim it with `/review`.",
        "A failure you cannot explain: `/investigate`.",
    ],
    "engineer": [
        "A bug or failing test: `/investigate` before changing code.",
        "Before handing work to QA or review: run `/review` on your branch and fix what it finds.",
        "When the CEO has approved shipping: `/ship` (tests, review, changelog, PR).",
    ],
    "pm": [
        "Turning a goal into a plan: `/autoplan`, then split the plan into Paperclip tasks.",
        "Pressure-testing scope: `/plan-ceo-review`; architecture: `/plan-eng-review`.",
        "Weekly: `/retro`, posted as a comment on the retro task.",
    ],
    "designer": [
        "Reviewing a plan's UX: `/plan-design-review`.",
        "Reviewing a built UI: `/design-review <url>`.",
    ],
    "security": ["Security audit: `/cso` (reports 'not assessed' until its Windows build tools are installed)."],
    "devops": ["Shipping: `/ship`; deploying and watching: `/land-and-deploy`, `/canary`."],
    "researcher": ["Open questions about the codebase: `/investigate`."],
}
KITS["general"] = KITS["pm"]
KITS["cto"] = KITS["pm"] + ["Code health overview: `/health`."]

COMMON = """You run unattended (`GSTACK_SESSION_KIND=unattended`): gstack will not ask you questions.
It takes the recommended non-destructive option at each decision and records anything that
needs a human (a consent, an unrecommended choice, an approval gate) as a pending item.

When gstack records a pending item, do not work past it. Ask the CEO on the task as a
Paperclip question (ask_user_questions) using the options gstack listed, mark the task
blocked on that answer, and continue only once it is answered.

Summarise gstack's report in your task comment, including the path of any report file it wrote."""


def call(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        text = res.read().decode()
        return json.loads(text) if text else None


def section(role):
    lines = KITS.get(role, KITS["general"])
    bullets = "\n".join(f"- {line}" for line in lines)
    return f"{BEGIN}\n## gstack playbook\n\ngstack skills are installed on this machine. Use them as your working method:\n\n{bullets}\n\n{COMMON}\n{END}"


def splice(content, new_section):
    if BEGIN in content and END in content:
        head, rest = content.split(BEGIN, 1)
        tail = rest.split(END, 1)[1]
        body = head.rstrip()
        return (f"{body}\n\n{new_section}" if new_section else body) + tail.rstrip() + "\n"
    if not new_section:
        return content
    return content.rstrip() + "\n\n" + new_section + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="employee name, e.g. QA")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--remove", action="store_true")
    args = ap.parse_args()

    companies = call("GET", "/companies")
    agent = next(
        (a for c in companies for a in call("GET", f"/companies/{c['id']}/agents") if a["name"] == args.name),
        None,
    )
    if not agent:
        sys.exit(f"No employee named {args.name!r}")

    entry = call("GET", f"/agents/{agent['id']}/instructions-bundle")["entryFile"]
    current = call("GET", f"/agents/{agent['id']}/instructions-bundle/file?path={entry}")
    updated = splice(current["content"], None if args.remove else section(agent["role"]))

    env = dict(agent["adapterConfig"].get("env") or {})
    if args.remove:
        env.pop("GSTACK_SESSION_KIND", None)
    else:
        env["GSTACK_SESSION_KIND"] = "unattended"

    print(f"{agent['name']} ({agent['role']}): instructions {'unchanged' if updated == current['content'] else 'updated'}, env={env}")
    if args.dry_run:
        print(updated[-1800:])
        return

    if updated != current["content"]:
        call("PUT", f"/agents/{agent['id']}/instructions-bundle/file",
             {"path": entry, "content": updated, "baseHash": current["contentHash"]})
    # adapterConfig patches merge shallowly, so send the whole env object.
    call("PATCH", f"/agents/{agent['id']}", {"adapterConfig": {"env": env}})
    print("done")


if __name__ == "__main__":
    main()
