"""Pinned upstream compatibility fix for GET /v1/skills (reproduced HTTP 500).

At a7b2ba02, the API passes include_editorial to _find_all_skills, whose
signature accepts only skip_disabled. Remove that unsupported keyword.
This does not change tool permissions or skill approval behavior.
"""
from pathlib import Path
import subprocess
import sys

source = Path(sys.argv[1]).resolve()
revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
if revision != "a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed":
    raise SystemExit("Unsupported Hermes revision; reassess the compatibility patch.")
target = source / "gateway/platforms/api_server.py"
text = target.read_text(encoding="utf-8")
before = "skip_disabled=False, include_editorial=True"
after = "skip_disabled=False  # incident-brain: pinned API/catalog compatibility"
if before in text:
    if text.count(before) != 1:
        raise SystemExit("Unexpected API source; patch not applied.")
    target.write_text(text.replace(before, after), encoding="utf-8")
elif after not in text:
    raise SystemExit("Expected API/catalog call not found.")
print("Pinned Hermes API/catalog compatibility patch applied.")
