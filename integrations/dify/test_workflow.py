"""Offline contract tests of our exported DSL. This is not the Dify engine/importer."""
import copy
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest
from urllib import error

import yaml
import generate_dsl
import run_workflow

ROOT = Path(__file__).resolve().parent
DSL = yaml.safe_load((ROOT / "s-care-hermes-knowledge.yml").read_text(encoding="utf-8"))
SEARCH = json.loads((ROOT / "examples/search-context.json").read_text(encoding="utf-8"))
DRAFT = json.loads((ROOT / "examples/draft-context.json").read_text(encoding="utf-8"))


def completion(content, **extra):
    return {"model": "fixture-model", "choices": [{"message": {"content": json.dumps(content, ensure_ascii=False)}}], **extra}


def search_answer():
    return {"skillIds": ["DEMO-SKILL-DB-01"], "manualIds": ["DEMO-MANUAL-DB-01"], "explanation": "가상 DB 연결 대기 점검을 선택했습니다."}


class FixtureRunner:
    """Walk DSL edges and execute exported code, substituting only the HTTP boundary."""
    def __init__(self):
        self.nodes = {n["id"]: n["data"] for n in DSL["workflow"]["graph"]["nodes"]}
        self.edges = DSL["workflow"]["graph"]["edges"]
        self.calls = []
        self.probe = {"data": [{"id": "terminal", "enabled": False}]}
        self.probe_status = 200
        self.answer = completion(search_answer())
        self.answer_status = 200
        self.env = {"HERMES_BASE_URL": "https://hermes.example.com/v1", "HERMES_MODEL": "hermes-agent",
                    "HERMES_API_KEY": "fixture-only-not-a-credential"}

    def run(self, context=SEARCH, mode="DEMO", operation="search"):
        values = {"env": self.env, "100": {"context_json": json.dumps(context, ensure_ascii=False), "mode": mode, "operation": operation}}
        def resolve(selector):
            return values[selector[0]][selector[1]]
        def render(template):
            return re.sub(r"\{\{#([^.]+)\.([^#]+)#\}\}", lambda m: str(resolve([m[1], m[2]])), template)
        current = "100"
        visited = set()
        while True:
            if current in visited:
                raise AssertionError("Cycle in workflow")
            visited.add(current)
            node = self.nodes[current]
            handle = "source"
            if node["type"] == "code":
                namespace = {}
                exec(compile(node["code"], "our-dsl-node-" + current, "exec"), namespace)
                values[current] = namespace["main"](**{v["variable"]: resolve(v["value_selector"]) for v in node["variables"]})
                if set(values[current]) != set(node["outputs"]):
                    raise AssertionError("Code output names differ from DSL declaration")
                for name, spec in node["outputs"].items():
                    expected = str if spec["type"] == "string" else (int, float)
                    if not isinstance(values[current][name], expected):
                        raise AssertionError("Code output type differs from DSL declaration")
            elif node["type"] == "if-else":
                case = node["cases"][0]
                handle = case["case_id"] if all(resolve(c["variable_selector"]) == c["value"] for c in case["conditions"]) else "false"
            elif node["type"] == "http-request":
                rendered_body = render(node["body"]["data"][0]["value"]) if node["body"]["data"] else None
                self.calls.append({"url": render(node["url"]), "method": node["method"], "body": rendered_body})
                status, body = (self.probe_status, self.probe) if current == "200" else (self.answer_status, self.answer)
                values[current] = {"status_code": status, "body": body if isinstance(body, str) else json.dumps(body)}
            elif node["type"] == "end":
                return json.loads(resolve(node["outputs"][0]["value_selector"]))
            matches = [e for e in self.edges if e["source"] == current and e["sourceHandle"] == handle]
            if len(matches) != 1:
                raise AssertionError("Missing or ambiguous edge")
            current = matches[0]["target"]


class WorkflowTests(unittest.TestCase):
    def test_export_matches_sources(self):
        self.assertEqual(DSL, generate_dsl.build())
        self.assertEqual(DSL["version"], "0.7.0")
        self.assertEqual(DSL["app"]["mode"], "workflow")

    def test_graph_references_and_secret_placement(self):
        nodes = {n["id"]: n["data"] for n in DSL["workflow"]["graph"]["nodes"]}
        edges = DSL["workflow"]["graph"]["edges"]
        self.assertEqual(len(nodes), 10)
        declared = {"env": {v["name"] for v in DSL["workflow"]["environment_variables"]}}
        for id, node in nodes.items():
            declared[id] = ({v["variable"] for v in node["variables"]} if node["type"] == "start" else
                            set(node["outputs"]) if node["type"] == "code" else
                            {"body", "status_code", "headers", "files"} if node["type"] == "http-request" else set())
        for edge in edges:
            self.assertIn(edge["source"], nodes)
            self.assertIn(edge["target"], nodes)
            self.assertEqual(edge["data"]["sourceType"], nodes[edge["source"]]["type"])
        def ancestors(id):
            found, pending = set(), [id]
            while pending:
                current = pending.pop()
                for edge in edges:
                    if edge["target"] == current and edge["source"] not in found:
                        found.add(edge["source"])
                        pending.append(edge["source"])
            return found
        for id, node in nodes.items():
            selectors = []
            if node["type"] == "code":
                selectors.extend(v["value_selector"] for v in node["variables"])
                self.assertNotIn("HERMES_API_KEY", node["code"])
            if node["type"] == "end":
                selectors.extend(v["value_selector"] for v in node["outputs"])
            if node["type"] == "if-else":
                selectors.extend(c["variable_selector"] for case in node["cases"] for c in case["conditions"])
            if node["type"] == "http-request":
                selectors.extend(re.findall(r"\{\{#([^.]+)\.([^#]+)#\}\}", json.dumps(node)))
                self.assertTrue(node["ssl_verify"])
                self.assertFalse(node["retry_config"]["retry_enabled"])
            for source, output in selectors:
                self.assertIn(output, declared[source])
                self.assertTrue(source == "env" or source in ancestors(id))
        secret = next(v for v in DSL["workflow"]["environment_variables"] if v["name"] == "HERMES_API_KEY")
        self.assertEqual(secret["value_type"], "secret")
        self.assertEqual(secret["value"], "")
        self.assertEqual(DSL["dependencies"], [])

    def test_demo_search_no_http_and_deterministic_content(self):
        runner = FixtureRunner()
        runner.env["HERMES_BASE_URL"] = "not-configured"
        result = runner.run()
        self.assertEqual(runner.calls, [])
        self.assertTrue(result["simulated"])
        self.assertFalse(result["hermesConnected"])
        self.assertEqual(result["content"], runner.run()["content"])

    def test_demo_draft_no_http(self):
        runner = FixtureRunner()
        result = runner.run(DRAFT, operation="draft")
        self.assertEqual(runner.calls, [])
        self.assertEqual(set(result["content"]), {"conditions", "checks", "solution", "cautions"})
        self.assertIn("시뮬레이션", result["content"]["cautions"])

    def test_real_search_order_escaping_and_provenance(self):
        runner = FixtureRunner()
        context = copy.deepcopy(SEARCH)
        context["observations"] = '가상 "따옴표"\n역슬래시 \\ 확인'
        context["untrusted_extra"] = "must-be-dropped"
        result = runner.run(context, "REAL")
        self.assertEqual([c["method"] for c in runner.calls], ["get", "post"])
        self.assertTrue(runner.calls[0]["url"].endswith("/v1/toolsets"))
        payload = json.loads(runner.calls[1]["body"])
        submitted = json.loads(payload["messages"][1]["content"])
        self.assertEqual(submitted["observations"], context["observations"])
        self.assertNotIn("untrusted_extra", submitted)
        self.assertNotIn("tools", payload)
        self.assertFalse(payload["stream"])
        self.assertEqual(result["provider"], "HERMES_AGENT")
        self.assertEqual(result["model"], "fixture-model")
        self.assertEqual(result["orchestrator"], "DIFY_WORKFLOW")
        self.assertFalse(result["simulated"])

    def test_real_draft_retains_approval_requirement(self):
        runner = FixtureRunner()
        runner.answer = completion({"conditions": "가상 DB 지연", "checks": "관측 자료 확인", "solution": "가상 복구 검증 통과", "cautions": "확정 원인 아님"})
        result = runner.run(DRAFT, "REAL", "draft")
        self.assertIn("관리자 검토·승인", result["content"]["cautions"])
        self.assertTrue(result["requiresBackendValidation"])

    def test_reject_nonfictional_or_invalid_inputs_before_http(self):
        for change in ({"fictional": False}, {"fictional": "true"}, {"type": "UNKNOWN"}, {"incidentId": "bad/id"}, {"observations": ""}):
            with self.subTest(change=change):
                runner = FixtureRunner()
                with self.assertRaises(ValueError):
                    runner.run({**SEARCH, **change}, "REAL")
                self.assertEqual(runner.calls, [])

    def test_invalid_mode_and_operation(self):
        for mode, operation in (("unknown", "search"), ("DEMO", "execute")):
            with self.assertRaises(ValueError):
                FixtureRunner().run(SEARCH, mode, operation)

    def test_reject_unapproved_or_wrong_type_knowledge(self):
        for field, value in (("status", "DRAFT"), ("type", "NETWORK")):
            context = copy.deepcopy(SEARCH)
            context["approvedSkills"][0][field] = value
            with self.assertRaises(ValueError):
                FixtureRunner().run(context, "REAL")

    def test_draft_requires_approved_fictional_recovery(self):
        changes = [{"approvals": []}, {"verification": {"passed": False, "realChanges": False}},
                   {"verification": {"passed": True, "realChanges": True}}]
        for change in changes:
            runner = FixtureRunner()
            with self.assertRaises(ValueError):
                runner.run({**DRAFT, **change}, "REAL", "draft")
            self.assertEqual(runner.calls, [])

    def test_database_verification_string_supported(self):
        result = FixtureRunner().run({**DRAFT, "verification": json.dumps(DRAFT["verification"])}, operation="draft")
        self.assertEqual(result["operation"], "draft")

    def test_real_rejects_local_or_placeholder_url(self):
        for url in ("http://hermes.example.com/v1", "https://127.0.0.1/v1", "https://host.invalid/v1",
                    "https://user:secret@hermes.example.com/v1", "https://hermes.example.com/v1?key=x"):
            runner = FixtureRunner()
            runner.env["HERMES_BASE_URL"] = url
            with self.assertRaises(ValueError):
                runner.run(mode="REAL")
            self.assertEqual(runner.calls, [])

    def test_enabled_or_unreported_toolset_stops_before_model_call(self):
        for tools in ([{"enabled": True}], [{"id": "terminal"}], None):
            runner = FixtureRunner()
            runner.probe = {"data": tools}
            with self.assertRaises(ValueError):
                runner.run(mode="REAL")
            self.assertEqual(len(runner.calls), 1)

    def test_probe_and_generation_http_errors_never_become_mock_success(self):
        for target in ("probe_status", "answer_status"):
            runner = FixtureRunner()
            setattr(runner, target, 503)
            with self.assertRaisesRegex(ValueError, "HTTP_503"):
                runner.run(mode="REAL")
            self.assertEqual(len(runner.calls), 1 if target == "probe_status" else 2)

    def test_unknown_skill_and_manual_ids_rejected(self):
        for field in ("skillIds", "manualIds"):
            runner = FixtureRunner()
            runner.answer = completion({**search_answer(), field: ["UNKNOWN"]})
            with self.assertRaisesRegex(ValueError, "unknown knowledge"):
                runner.run(mode="REAL")

    def test_empty_selection_rejected_when_approved_skills_exist(self):
        runner = FixtureRunner()
        runner.answer = completion({**search_answer(), "skillIds": []})
        with self.assertRaises(ValueError):
            runner.run(mode="REAL")

    def test_empty_knowledge_context_allowed(self):
        runner = FixtureRunner()
        runner.answer = completion({"skillIds": [], "manualIds": [], "explanation": "승인 지식이 없어 담당자 확인이 필요합니다."})
        result = runner.run({**SEARCH, "approvedSkills": [], "manuals": []}, "REAL")
        self.assertEqual(result["content"]["skillIds"], [])

    def test_invalid_json_or_tool_call_rejected(self):
        for answer in ("bad-json", {"choices": [{"message": {"tool_calls": [{"name": "shell"}], "content": "{}"}}]}):
            runner = FixtureRunner()
            runner.answer = answer
            with self.assertRaises(ValueError):
                runner.run(mode="REAL")

    def test_unknown_model_not_inferred_from_configuration(self):
        runner = FixtureRunner()
        del runner.answer["model"]
        self.assertEqual(runner.run(mode="REAL")["model"], "unreported")


class ClientTests(unittest.TestCase):
    def response(self):
        return {"workflow_run_id": "fixture-run-001", "data": {"status": "succeeded", "outputs": {
            "result_json": json.dumps(FixtureRunner().run())}}}

    def test_request_contract(self):
        payload = run_workflow.make_payload(SEARCH)
        self.assertEqual(payload["response_mode"], "blocking")
        self.assertEqual(json.loads(payload["inputs"]["context_json"]), SEARCH)
        self.assertNotIn("key", json.dumps(payload))

    def test_cli_dry_run_preserves_korean_utf8(self):
        result = subprocess.run([sys.executable, str(ROOT / "run_workflow.py"), "--context",
                                 str(ROOT / "examples/search-context.json"), "--dry-run"],
                                check=True, capture_output=True)
        payload = json.loads(result.stdout.decode("utf-8"))
        self.assertEqual(json.loads(payload["inputs"]["context_json"])["observations"], SEARCH["observations"])

    def test_response_contract_and_run_id(self):
        result = run_workflow.parse_response(self.response(), run_workflow.make_payload(SEARCH))
        self.assertEqual(result["workflow_run_id"], "fixture-run-001")
        self.assertTrue(result["result"]["simulated"])

    def test_failed_workflow_and_wrong_provenance_rejected(self):
        payload = run_workflow.make_payload(SEARCH)
        failed = self.response()
        failed["data"]["status"] = "failed"
        with self.assertRaises(ValueError):
            run_workflow.parse_response(failed, payload)
        with self.assertRaises(ValueError):
            run_workflow.parse_response(self.response(), run_workflow.make_payload(SEARCH, "REAL"))

    def test_http_contract_without_network(self):
        outer = self
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return json.dumps(outer.response()).encode()
        class Opener:
            calls = 0
            def open(self, req, timeout):
                self.calls += 1
                outer.assertEqual(req.full_url, "https://api.dify.ai/v1/workflows/run")
                outer.assertEqual(req.get_header("Authorization"), "Bearer fixture-only")
                outer.assertEqual(req.method, "POST")
                outer.assertEqual(timeout, 95)
                return Response()
        opener = Opener()
        run_workflow.execute(run_workflow.make_payload(SEARCH), "fixture-only", opener)
        self.assertEqual(opener.calls, 1)

    def test_network_failure_not_retried_and_secret_not_in_error(self):
        class Opener:
            calls = 0
            def open(self, req, timeout):
                self.calls += 1
                raise error.URLError("fixture-only-private-detail")
        opener = Opener()
        with self.assertRaises(ValueError) as caught:
            run_workflow.execute(run_workflow.make_payload(SEARCH), "fixture-only", opener)
        self.assertNotIn("private-detail", str(caught.exception))
        self.assertEqual(opener.calls, 1)

    def test_missing_key_and_redirect_rejected(self):
        with self.assertRaises(ValueError):
            run_workflow.execute(run_workflow.make_payload(SEARCH), "")
        self.assertIsNone(run_workflow.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example"))


if __name__ == "__main__":
    unittest.main()
