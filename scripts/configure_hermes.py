"""Configure a dedicated Nous Hermes home. No key is printed or committed."""
import argparse
import json
import os
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def configure(home, env_file, host):
    values = {**read_env(env_file), **os.environ}
    home.mkdir(parents=True, exist_ok=True)
    old = read_env(home / ".env")
    key = values.get("HERMES_API_KEY") or old.get("API_SERVER_KEY") or secrets.token_hex(32)
    config = {
        "model": {"provider": "openai", "default": values.get("HERMES_LLM_MODEL", "gpt-4.1-mini"),
                  "base_url": "https://api.openai.com/v1"},
        "platform_toolsets": {"api_server": [], "cli": []}, "mcp_servers": {},
        "agent": {"max_turns": 2, "gateway_timeout": 75},
        "memory": {"memory_enabled": False, "user_profile_enabled": False},
        "platforms": {"api_server": {"enabled": True, "extra": {"host": host, "port": 8642}}},
        "skills": {"creation_nudge_interval": 0},
    }
    # JSON is a YAML subset; this is an application-owned, isolated configuration.
    (home / "config.yaml").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    secret_values = {"API_SERVER_ENABLED": "true", "API_SERVER_HOST": host,
                     "API_SERVER_PORT": "8642", "API_SERVER_KEY": key,
                     "OPENAI_BASE_URL": "https://api.openai.com/v1",
                     "OPENAI_API_KEY": values.get("OPENAI_API_KEY") or old.get("OPENAI_API_KEY", "")}
    (home / ".env").write_text("\n".join(f"{k}={v}" for k, v in secret_values.items()) + "\n", encoding="utf-8")
    # Add local adapter settings without overwriting the user's other .env values.
    lines = env_file.read_text(encoding="utf-8-sig").splitlines() if env_file.exists() else []
    changes = {"HERMES_API_KEY": key, "HERMES_URL": "http://127.0.0.1:8642/v1",
               "HERMES_SKILLS_DIR": str(home / "skills").replace("\\", "/")}
    for k, v in changes.items():
        lines = [line for line in lines if not line.startswith(k + "=")]
        lines.append(f"{k}={v}")
    for k, v in {"OPENAI_API_KEY": "", "HERMES_LLM_MODEL": "gpt-4.1-mini"}.items():
        if not any(line.startswith(k + "=") for line in lines):
            lines.append(f"{k}={v}")
    env_file.parent.mkdir(parents=True, exist_ok=True)
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return secret_values


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--home", type=Path, default=ROOT / "runtime/hermes-home")
    p.add_argument("--env-file", type=Path, default=ROOT / ".env")
    p.add_argument("--host", default="127.0.0.1")
    a = p.parse_args()
    configure(a.home.resolve(), a.env_file.resolve(), a.host)
    print("Hermes configured. API credentials saved locally; executable tools disabled.")
