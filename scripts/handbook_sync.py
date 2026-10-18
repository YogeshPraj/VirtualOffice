"""Keep the CEO handbook in a file (your private company repo) in sync with Paperclip.

    python scripts/handbook_sync.py push company/handbook/ceo-handbook.md   # file -> Paperclip
    python scripts/handbook_sync.py pull company/handbook/ceo-handbook.md   # Paperclip -> file
    python scripts/handbook_sync.py diff company/handbook/ceo-handbook.md

`push` creates the `ceo-handbook` company skill if it doesn't exist yet. Edits made in the pixel
office (📓 STUDY → Handbook) go straight to Paperclip, so `pull` them back before committing.
After the first push, run `python scripts/brain_equip.py` so every employee gets the skill.
"""

import argparse
import difflib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:3100/api"
SLUG = "ceo-handbook"


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


def company(name):
    companies = call("GET", "/companies")
    if name:
        match = [c for c in companies if c["name"] == name]
        if not match:
            sys.exit(f"No company named {name!r}")
        return match[0]
    if len(companies) != 1:
        sys.exit("Several companies exist; pass --company NAME")
    return companies[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["push", "pull", "diff"])
    ap.add_argument("file")
    ap.add_argument("--company", help="company name (needed only if you run several)")
    args = ap.parse_args()

    co = company(args.company)
    path = Path(args.file)
    skill = next((s for s in call("GET", f"/companies/{co['id']}/skills") if s["slug"] == SLUG), None)
    live = call("GET", f"/companies/{co['id']}/skills/{skill['id']}/files?path=SKILL.md")["content"] if skill else None

    if args.action == "pull":
        if live is None:
            sys.exit("No handbook in Paperclip yet; push one first.")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(live, encoding="utf-8", newline="\n")
        print(f"Pulled the live handbook into {path}")
        return

    local = path.read_text(encoding="utf-8")
    if "{{" in local:
        sys.exit(f"{path} still has {{{{placeholders}}}}; fill them in first.")

    if args.action == "diff":
        if live is None:
            print("No handbook in Paperclip yet.")
            return
        sys.stdout.writelines(difflib.unified_diff(live.splitlines(True), local.splitlines(True), "paperclip", str(path)))
        return

    if skill is None:
        call("POST", f"/companies/{co['id']}/skills", {
            "name": SLUG, "slug": SLUG, "markdown": local, "categories": ["company"], "authorName": "CEO",
            "description": "The CEO's handbook: working style, company assets and house rules. Read at the start of every task.",
        })
        print(f"Created the {SLUG} skill for {co['name']}. Now run: python scripts/brain_equip.py")
    elif live == local:
        print("Paperclip already has this version.")
    else:
        call("PATCH", f"/companies/{co['id']}/skills/{skill['id']}/files", {"path": "SKILL.md", "content": local})
        print(f"Published {path} to {co['name']}. Employees get it on their next task.")


if __name__ == "__main__":
    main()
