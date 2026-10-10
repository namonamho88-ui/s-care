"""Supervise the official gateway and optional app-owned Skill bridge in one volume owner."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def main():
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    children = []
    try:
        children.append(subprocess.Popen(["hermes", "gateway", "run"]))
        if os.environ.get("HERMES_PUBLISH_KEY"):
            # The bridge has no use for upstream model credentials.
            child_env = {k: v for k, v in os.environ.items() if k not in {"OPENAI_API_KEY", "HERMES_API_KEY", "API_SERVER_KEY"}}
            children.append(subprocess.Popen([sys.executable, str(Path(__file__).with_name("hermes_skill_bridge.py"))], env=child_env))
        while not stopping and all(child.poll() is None for child in children):
            time.sleep(0.5)
        # A terminated child must trigger service restart rather than a false healthy gateway.
        return 0 if stopping else 1
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    sys.exit(main())
