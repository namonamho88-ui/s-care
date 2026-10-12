import json
import time


def main(status_code: int, body: str, context_json: str, operation: str, started_at: float) -> dict:
    if status_code != 200:
        raise ValueError("HERMES_GENERATION_HTTP_" + str(status_code))
    response = json.loads(body)
    message = response["choices"][0]["message"]
    if message.get("tool_calls"):
        raise ValueError("Tool calls are forbidden")
    raw = message.get("content", "")
    if not isinstance(raw, str) or len(raw) > 32000:
        raise ValueError("Invalid model content")
    raw = raw.strip()
    if raw.startswith("```json") and raw.endswith("```"):
        raw = raw[7:-3].strip()
    elif raw.startswith("```") and raw.endswith("```"):
        raw = raw[3:-3].strip()
    content = json.loads(raw)
    if not isinstance(content, dict):
        raise ValueError("Expected an object")
    context = json.loads(context_json)

    def text(name):
        value = content.get(name)
        if not isinstance(value, str) or not value.strip() or len(value) > 6000:
            raise ValueError("Invalid model field: " + name)
        return value

    if operation == "search":
        cleaned = {"explanation": text("explanation")}
        for name, source in (("skillIds", "approvedSkills"), ("manualIds", "manuals")):
            ids = content.get(name)
            allowed = {row["id"] for row in context[source]}
            if not isinstance(ids, list) or any(not isinstance(i, str) or i not in allowed for i in ids):
                raise ValueError("Unapproved or unknown knowledge reference")
            cleaned[name] = list(dict.fromkeys(ids))
        if context["approvedSkills"] and not cleaned["skillIds"]:
            raise ValueError("No approved Skill selected")
    else:
        cleaned = {name: text(name) for name in ("conditions", "checks", "solution", "cautions")}
        cleaned["cautions"] += " 관리자 검토·승인 후 가상 자산에만 적용하며 실제 운영 명령은 실행하지 않습니다."
        if len(cleaned["cautions"]) > 6000:
            raise ValueError("Cautions exceed backend limit")
    model = response.get("model")
    if not isinstance(model, str) or not model.strip() or len(model) > 100:
        model = "unreported"
    result = {"content": cleaned, "provider": "HERMES_AGENT", "model": model,
              "orchestrator": "DIFY_WORKFLOW", "operation": operation, "fictional": True,
              "simulated": False, "fallback": False, "hermesConnected": True,
              "latencyMs": max(0, int((time.time()-started_at)*1000)), "latencyScope": "DIFY_WORKFLOW",
              "requiresBackendValidation": True}
    return {"result_json": json.dumps(result, ensure_ascii=False)}
