import json
import re
import time
from urllib.parse import urlsplit


def main(context_json: str, operation: str, mode: str, hermes_url: str, hermes_model: str) -> dict:
    if operation not in ("search", "draft") or mode not in ("DEMO", "REAL"):
        raise ValueError("operation must be search/draft and mode must be DEMO/REAL")
    if len(context_json) > 65536:
        raise ValueError("Context exceeds 65536 characters")
    context = json.loads(context_json)
    if not isinstance(context, dict) or context.get("fictional") is not True:
        raise ValueError("Only explicitly fictional incident context is accepted")

    def text(value, label, limit=6000):
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError("Invalid " + label)
        return value

    incident_id = text(context.get("incidentId"), "incidentId", 100)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", incident_id):
        raise ValueError("Invalid incidentId")
    incident_type = context.get("type")
    if incident_type not in ("RESOURCE", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"):
        raise ValueError("Incident classification must be confirmed before knowledge selection")
    clean = {"fictional": True, "incidentId": incident_id, "type": incident_type,
             "observations": text(context.get("observations"), "observations", 4000)}
    fields = {
        "approvedSkills": (40, ("title", "conditions", "checks", "solution", "cautions")),
        "manuals": (60, ("title", "procedure_text")),
        "similarIncidents": (3, ("title", "notes", "prevention")),
    }
    for collection, (limit, names) in fields.items():
        rows = context.get(collection, [])
        if not isinstance(rows, list) or len(rows) > limit:
            raise ValueError("Invalid " + collection)
        clean[collection] = []
        seen = set()
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid context row")
            row_id = text(row.get("id"), collection + " id", 100)
            if row_id in seen:
                raise ValueError("Duplicate context ID")
            seen.add(row_id)
            if collection == "approvedSkills" and row.get("status") != "APPROVED":
                raise ValueError("Unapproved Skill must never enter the workflow")
            if collection in ("approvedSkills", "manuals") and row.get("type", incident_type) != incident_type:
                raise ValueError("Knowledge type does not match the incident")
            item = {"id": row_id}
            for name in names:
                if row.get(name) not in (None, ""):
                    item[name] = text(row[name], name)
            if collection == "approvedSkills":
                item["status"] = "APPROVED"
            clean[collection].append(item)

    if operation == "draft":
        proof = context.get("verification")
        if isinstance(proof, str):
            proof = json.loads(proof)
        if not isinstance(proof, dict) or proof.get("passed") is not True or proof.get("realChanges") is not False:
            raise ValueError("Draft requires passed fictional recovery verification")
        approvals = context.get("approvals", [])
        if not isinstance(approvals, list) or not any(isinstance(a, dict) and a.get("approved") is True for a in approvals):
            raise ValueError("Draft requires prior backend approval evidence")
        # Input evidence is not authorization. Spring Boot must recheck DB state on return.
        clean["verification"] = {"passed": True, "realChanges": False}
        clean["approvals"] = [{"approved": True}]
        for name, allowed in {"decision": ("type", "severity", "department", "provider", "model", "simulated"),
                              "impact": ("engine", "root", "affected")}.items():
            value = context.get(name, {})
            if not isinstance(value, dict):
                raise ValueError("Invalid " + name)
            clean[name] = {key: value[key] for key in allowed if key in value}
    url = hermes_url.strip().rstrip("/")
    model = hermes_model.strip() or "hermes-agent"
    if mode == "REAL":
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        if (parsed.scheme != "https" or not host or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path != "/v1"
                or host in ("localhost", "127.0.0.1", "::1") or host.endswith((".invalid", ".local", ".internal"))):
            raise ValueError("Set HERMES_BASE_URL to your reachable HTTPS Hermes /v1 API")
        if len(model) > 100:
            raise ValueError("Invalid HERMES_MODEL")
    return {"context_json": json.dumps(clean, ensure_ascii=False), "operation": operation,
            "mode": mode, "hermes_url": url, "hermes_model": model, "started_at": time.time()}
