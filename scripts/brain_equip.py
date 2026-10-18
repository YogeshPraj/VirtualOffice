"""Give employees the CEO handbook and the second brain.

For each employee: adds the `ceo-handbook` company skill to their skill set and a marked
"Company knowledge" section to their AGENTS.md. Re-running is safe: the section is replaced,
never duplicated, and existing skills are kept.

    python scripts/brain_equip.py            # every active employee
    python scripts/brain_equip.py QA Ada     # just these
    python scripts/brain_equip.py --dry-run
    python scripts/brain_equip.py --remove
"""

import argparse
import json
import sys
import urllib.request

API = "http://127.0.0.1:3100/api"
BEGIN = "<!-- company-knowledge:begin -->"
END = "<!-- company-knowledge:end -->"
SKILL_SLUG = "ceo-handbook"

SECTION = f"""{BEGIN}
## Company knowledge (read first)

1. At the start of every task, load the `ceo-handbook` skill and follow it. It holds the CEO's
   working style, the company's assets and the house rules (including the off-limits folders).
2. Before you start the work, check the company's second brain: use the `gbrain` MCP tools to
   recall what is known about the task's subject (repo, feature, people, past decisions).
3. When you learn something durable, save it to the brain with `remember` (one fact per call,
   with its entity and where you learned it). Never save secrets.
{END}"""


def call(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")


def splice(content, new_section):
    if BEGIN in content and END in content:
        head, rest = content.split(BEGIN, 1)
        tail = rest.split(END, 1)[1]
        body = head.rstrip()
        return (f"{body}\n\n{new_section}" if new_section else body) + tail.rstrip() + "\n"
    if not new_section:
        return content
    # Put it near the top so it is read before role-specific detail.
    lines = content.split("\n")
    first_blank = next((i for i, l in enumerate(lines) if i > 0 and not l.strip()), len(lines))
    return "\n".join(lines[:first_blank]) + "\n\n" + new_section + "\n" + "\n".join(lines[first_blank:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--remove", action="store_true")
    args = ap.parse_args()

    for company in call("GET", "/companies"):
        skills = call("GET", f"/companies/{company['id']}/skills")
        handbook = next((s for s in skills if s["slug"] == SKILL_SLUG), None)
        if not handbook:
            print(f"{company['name']}: no {SKILL_SLUG} skill, skipping")
            continue
        for agent in call("GET", f"/companies/{company['id']}/agents"):
            if agent["status"] == "terminated" or (args.names and agent["name"] not in args.names):
                continue
            entry = call("GET", f"/agents/{agent['id']}/instructions-bundle")["entryFile"]
            current = call("GET", f"/agents/{agent['id']}/instructions-bundle/file?path={entry}")
            updated = splice(current["content"], None if args.remove else SECTION)
            snapshot = call("GET", f"/agents/{agent['id']}/skills")
            desired = [k for k in snapshot["desiredSkills"] if k != handbook["key"]]
            if not args.remove:
                desired.append(handbook["key"])
            print(f"{agent['name']}: instructions {'unchanged' if updated == current['content'] else 'updated'}, "
                  f"skills {len(snapshot['desiredSkills'])} -> {len(desired)}")
            if args.dry_run:
                continue
            if updated != current["content"]:
                call("PUT", f"/agents/{agent['id']}/instructions-bundle/file",
                     {"path": entry, "content": updated, "baseHash": current["contentHash"]})
            if sorted(desired) != sorted(snapshot["desiredSkills"]):
                call("POST", f"/agents/{agent['id']}/skills/sync", {"mode": "replace", "desiredSkills": desired})


if __name__ == "__main__":
    main()
