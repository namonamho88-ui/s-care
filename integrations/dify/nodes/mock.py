import json
import time


def main(context_json: str, operation: str, started_at: float) -> dict:
    context = json.loads(context_json)
    if operation == "search":
        content = {"skillIds": [s["id"] for s in context["approvedSkills"][:3]],
                   "manualIds": [m["id"] for m in context["manuals"][:3]],
                   "explanation": "가상 시연용 고정 선택입니다. 전달된 승인 Skill과 매뉴얼의 앞 3건을 선택했으며 모델 유사도 판단이 아닙니다."}
    else:
        content = {"conditions": context["observations"],
                   "checks": "관측값, 의존 관계, 관리자 승인 기록과 가상 복구 검증을 확인합니다.",
                   "solution": "전달된 가상 복구 검증이 통과했습니다. 구체적인 조치 절차는 담당자가 보완해야 합니다.",
                   "cautions": "시뮬레이션 초안입니다. 관리자 검토 후 승인해야 지식으로 사용합니다. 실제 시스템 명령을 실행하지 않습니다."}
    result = {"content": content, "provider": "MOCK_DIFY_HERMES", "model": "deterministic-dify-knowledge-v1",
              "orchestrator": "DIFY_WORKFLOW", "operation": operation, "fictional": True,
              "simulated": True, "fallback": False, "hermesConnected": False,
              "latencyMs": max(0, int((time.time()-started_at)*1000)), "latencyScope": "DIFY_WORKFLOW",
              "requiresBackendValidation": True}
    return {"result_json": json.dumps(result, ensure_ascii=False)}
