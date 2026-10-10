"""Actual local Jev + official Hermes/OpenAI + DB round trip, using fictional data.

Creates a fictional incident and records test approvals. Never accepts Mock as
real integration success. Requires running backend, graph, Jev and Hermes.
"""
import argparse
import json
import os
import time
import urllib.request
from pathlib import Path
from configure_hermes import read_env, ROOT

p = argparse.ArgumentParser()
p.add_argument("--url", default="http://127.0.0.1:8080")
p.add_argument("--resume", help="Continue an existing incident after administrator review in UI")
p.add_argument("--output", type=Path, default=ROOT / "work/hermes-smoke.json")
a = p.parse_args()
env = {**read_env(ROOT / ".env"), **os.environ}
token = env.get("ADMIN_TOKEN", "local-demo-admin-change-me")


def request(url, key, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def api(path, body=None):
    return request(a.url + "/api" + path, token, body)


def catalog():
    return request(env.get("HERMES_URL", "http://127.0.0.1:8642/v1") + "/skills", env["HERMES_API_KEY"])["data"]


def wait(incident_id, target):
    end = time.monotonic() + 240
    while time.monotonic() < end:
        detail = api("/incidents/" + incident_id)
        if detail["status"] == target:
            return detail
        if detail["status"] in ("FAILED", "NEEDS_REVIEW"):
            raise RuntimeError(f"{incident_id}: {detail['status']}; continue in UI, do not bypass review")
        time.sleep(.5)
    raise TimeoutError(incident_id)


sync = api("/hermes/sync", {})
assert sync["configured"] and all(r["status"] == "EXPORTED" for r in sync["results"])
id = a.resume or api("/simulate", {"scenarioId": "SCN-01", "mode": "REAL", "provider": "LOCAL"})["id"]
print("Created fictional incident " + id, flush=True)
detail = wait(id, "WAITING_APPROVAL")
assert detail["decision"]["provider"] == "LOCAL_JEV" and not detail["decision"]["simulated"]
assert detail["impact"]["engine"] == "NEO4J"
results = {t["agent"]: json.loads(t["result_json"])["artifacts"][0]["parts"][0]["data"] for t in detail["tasks"]}
assert results["diagnosis"]["provider"] == "LOCAL_JEV" and not results["diagnosis"]["simulated"]
assert results["knowledge"]["provider"] == "HERMES_AGENT" and not results["knowledge"]["simulated"]
api("/incidents/" + id + "/approval", {"approved": True, "reason": "실제 Provider 통합 테스트: 가상 관측·영향·승인 Skill 검토 완료"})
detail = wait(id, "RESOLVED")
draft = next(s for s in api("/skills") if s["incident_id"] == id)
assert draft["status"] == "DRAFT" and draft["source_provider"] == "HERMES_AGENT" and not draft["simulated"]
skill_name = "incident-brain-" + draft["id"].lower()
assert not any(s["name"] == skill_name for s in catalog()), "Unapproved draft was published"
review = api("/skills/" + draft["id"] + "/review", {"status": "APPROVED"})
assert review["export"]["status"] == "EXPORTED"
after = catalog()
assert any(s["name"] == skill_name for s in after), "Approved skill absent from actual Hermes API"
api("/incidents/" + id + "/close", {})
proof = {"fictional": True, "incident": api("/incidents/" + id), "skill": next(s for s in api("/skills") if s["id"] == draft["id"]),
         "hermesCatalogEntry": next(s for s in after if s["name"] == skill_name), "config": api("/config"),
         "draftAbsentBeforeApproval": True, "publishedAfterApproval": True}
a.output.parent.mkdir(parents=True, exist_ok=True)
a.output.write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"id": id, "status": "CLOSED", "jev": detail["decision"]["provider"],
                  "diagnosis": results["diagnosis"]["causeCode"], "knowledge": results["knowledge"]["provider"],
                  "skillProvider": draft["source_provider"], "skillPublished": True, "output": str(a.output)}, ensure_ascii=False))
