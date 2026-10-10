"""Application-owned approved Skill receiver; this is NOT an official Hermes API.

Runs beside Hermes on its private network and writes only its dedicated skills volume.
No LLM calls, shell tools, arbitrary paths, or draft publication.
"""
import asyncio
import hashlib
import hmac
import os
from pathlib import Path
import re
import tempfile

from aiohttp import web


def create_app(directory, key):
    if len(key) < 32:
        raise ValueError("HERMES_PUBLISH_KEY must contain at least 32 characters")
    root = Path(directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    lock = asyncio.Lock()

    async def health(request):
        return web.json_response({"status": "UP", "service": "incident-brain-skill-bridge"})

    async def publish(request):
        if not hmac.compare_digest(request.headers.get("Authorization", ""), "Bearer " + key):
            raise web.HTTPUnauthorized(text="Authentication required")
        skill_id = request.match_info["skill_id"]
        if not re.fullmatch(r"[A-Za-z0-9-]{1,40}", skill_id):
            raise web.HTTPBadRequest(text="Invalid skill id")
        try:
            payload = await request.json()
        except (ValueError, UnicodeError):
            raise web.HTTPBadRequest(text="Invalid JSON")
        if not isinstance(payload, dict) or payload.get("approved") is not True or payload.get("fictional") is not True:
            raise web.HTTPBadRequest(text="Only approved fictional knowledge is accepted")
        markdown = payload.get("markdown")
        name = "incident-brain-" + skill_id.lower()
        if not isinstance(markdown, str) or len(markdown.encode("utf-8")) > 65536:
            raise web.HTTPBadRequest(text="Invalid Skill content")
        data = markdown.encode("utf-8")
        digest = hashlib.sha256(data).hexdigest()
        if payload.get("sha256") != digest or not markdown.startswith(f"---\nname: {name}\n"):
            raise web.HTTPBadRequest(text="Skill integrity check failed")
        if not all(section in markdown for section in ("## 적용 조건", "## 점검 절차", "## 해결 방법", "## 주의사항")):
            raise web.HTTPBadRequest(text="Skill sections missing")
        async with lock:
            folder = root / name
            if folder.is_symlink():
                raise web.HTTPBadRequest(text="Invalid Skill directory")
            folder.mkdir(exist_ok=True)
            if folder.resolve().parent != root:
                raise web.HTTPBadRequest(text="Invalid Skill directory")
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=folder, prefix="skill-", suffix=".tmp", delete=False) as file:
                    temporary = Path(file.name)
                    file.write(data)
                    file.flush()
                    os.fsync(file.fileno())
                os.replace(temporary, folder / "SKILL.md")
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        return web.json_response({"status": "EXPORTED", "skillId": skill_id, "sha256": digest})

    app = web.Application(client_max_size=100 * 1024)
    app.router.add_get("/health", health)
    app.router.add_put("/skills/{skill_id}", publish)
    return app


if __name__ == "__main__":
    home = Path(os.environ.get("HERMES_HOME", "runtime/hermes-home"))
    web.run_app(create_app(home / "skills", os.environ.get("HERMES_PUBLISH_KEY", "")),
                host=os.environ.get("HERMES_PUBLISH_HOST", "127.0.0.1"),
                port=int(os.environ.get("HERMES_PUBLISH_PORT", "8643")), access_log=None)
