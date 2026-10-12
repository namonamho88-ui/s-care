"""Call a published Dify Cloud workflow; never loads or prints local secret files."""
import argparse
import json
import os
from pathlib import Path
import sys
from urllib import error, request

API_URL = "https://api.dify.ai/v1/workflows/run"
MAX_RESPONSE_BYTES = 1_048_576


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward an app credential to a redirect destination.
        return None


def make_payload(context, mode="DEMO", operation="search"):
    if mode not in ("DEMO", "REAL") or operation not in ("search", "draft"):
        raise ValueError("Invalid mode or operation")
    if not isinstance(context, dict) or context.get("fictional") is not True:
        raise ValueError("Only fictional context is accepted")
    serialized = json.dumps(context, ensure_ascii=False)
    if len(serialized) > 65536:
        raise ValueError("Context exceeds 65536 characters")
    return {"inputs": {"mode": mode, "operation": operation, "context_json": serialized},
            "response_mode": "blocking", "user": "s-care-fictional-dify-demo"}


def parse_response(response, payload):
    if not isinstance(response, dict):
        raise ValueError("Invalid Dify response")
    data = response.get("data")
    if not isinstance(data, dict) or data.get("status") != "succeeded":
        # Raw errors may include prompts or credentials: inspect them in the protected Dify console.
        raise ValueError("Dify workflow did not succeed; check its run log")
    result = json.loads(data.get("outputs", {}).get("result_json", "null"))
    demo = payload["inputs"]["mode"] == "DEMO"
    expected = {"fictional": True, "simulated": demo, "fallback": False, "hermesConnected": not demo,
                "provider": "MOCK_DIFY_HERMES" if demo else "HERMES_AGENT", "orchestrator": "DIFY_WORKFLOW",
                "operation": payload["inputs"]["operation"], "requiresBackendValidation": True}
    if not isinstance(result, dict) or any(type(result.get(k)) is not type(v) or result[k] != v for k, v in expected.items()):
        raise ValueError("Unexpected workflow provenance; check the published DSL")
    if not isinstance(result.get("content"), dict):
        raise ValueError("Missing workflow content")
    run_id = response.get("workflow_run_id")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("Missing workflow_run_id")
    return {"workflow_run_id": run_id, "result": result}


def execute(payload, api_key, opener=None):
    if not api_key or not api_key.strip():
        raise ValueError("Set DIFY_APP_API_KEY in this process environment")
    req = request.Request(API_URL, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                          headers={"Content-Type": "application/json", "Accept": "application/json",
                                   "Authorization": "Bearer " + api_key.strip()}, method="POST")
    opener = opener or request.build_opener(NoRedirect())
    try:
        # No retries: a timeout does not prove that the original model run stopped.
        with opener.open(req, timeout=95) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except error.HTTPError as exc:
        raise ValueError(f"Dify HTTP {exc.code}; check the app key, publication and run log") from None
    except (error.URLError, TimeoutError, OSError):
        raise ValueError("Dify connection failed or timed out; inspect the run log before retrying") from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("Dify response exceeds the client limit")
    return parse_response(json.loads(raw), payload)


def main():
    # Keep Korean JSON readable when Windows redirects stdout to a file or pipe.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", type=Path, required=True)
    parser.add_argument("--mode", choices=("DEMO", "REAL"), default="DEMO")
    parser.add_argument("--operation", choices=("search", "draft"), default="search")
    parser.add_argument("--dry-run", action="store_true", help="Print the fictional request without calling Dify")
    args = parser.parse_args()
    try:
        if args.context.stat().st_size > 262144:
            raise ValueError("Context file is too large")
        context = json.loads(args.context.read_text(encoding="utf-8-sig"))
        payload = make_payload(context, args.mode, args.operation)
        result = payload if args.dry_run else execute(payload, os.environ.get("DIFY_APP_API_KEY", ""))
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, TypeError, AttributeError, OSError):
        # Do not echo arbitrary server body, user context, exception detail or credentials.
        print("실행 실패: 입력 형식·DIFY_APP_API_KEY·게시 여부와 Dify 실행 로그를 확인하세요. 자동 재시도하지 않았습니다.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
