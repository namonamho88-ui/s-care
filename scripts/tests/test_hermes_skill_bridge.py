import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aiohttp.test_utils import AioHTTPTestCase
from hermes_skill_bridge import create_app

KEY = "fictional-test-publish-key-32-characters"


class SkillBridgeTest(AioHTTPTestCase):
    async def get_application(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        return create_app(self.root, KEY)

    def payload(self):
        markdown = '---\nname: incident-brain-skl-test\ndescription: "가상 테스트"\n---\n'
        markdown += '\n## 적용 조건\n가상\n## 점검 절차\n점검\n## 해결 방법\n복구\n## 주의사항\n실제 변경 금지\n'
        return {"approved": True, "fictional": True, "markdown": markdown,
                "sha256": hashlib.sha256(markdown.encode()).hexdigest()}

    async def send(self, payload, key=KEY, skill_id="SKL-TEST"):
        return await self.client.put("/skills/" + skill_id, json=payload,
                                     headers={"Authorization": "Bearer " + key})

    async def test_authentication_precedes_disk_write(self):
        self.assertEqual((await self.send(self.payload(), key="wrong")).status, 401)
        self.assertEqual(list(self.root.iterdir()), [])

    async def test_drafts_and_nonfictional_content_are_rejected(self):
        for field in ("approved", "fictional"):
            payload = self.payload()
            payload[field] = False
            self.assertEqual((await self.send(payload)).status, 400)
        self.assertEqual(list(self.root.iterdir()), [])

    async def test_retries_write_one_identical_skill_with_digest_receipt(self):
        payload = self.payload()
        for _ in range(2):
            response = await self.send(payload)
            self.assertEqual(response.status, 200)
            receipt = await response.json()
            self.assertEqual(receipt["sha256"], payload["sha256"])
        self.assertEqual((self.root / "incident-brain-skl-test/SKILL.md").read_text(encoding="utf-8"), payload["markdown"])
        self.assertEqual(len(list(self.root.rglob("*"))), 2)

    async def test_invalid_digest_namespace_and_sections_are_rejected(self):
        payload = self.payload()
        payload["sha256"] = "0" * 64
        self.assertEqual((await self.send(payload)).status, 400)
        self.assertEqual((await self.send(self.payload(), skill_id="other")).status, 400)
        payload = self.payload()
        payload["markdown"] = payload["markdown"].replace("## 주의사항", "missing")
        payload["sha256"] = hashlib.sha256(payload["markdown"].encode()).hexdigest()
        self.assertEqual((await self.send(payload)).status, 400)
        self.assertEqual(list(self.root.iterdir()), [])

    async def test_malformed_and_oversized_input(self):
        self.assertEqual((await self.send([])).status, 400)
        payload = self.payload()
        payload["markdown"] = "x" * (120 * 1024)
        self.assertEqual((await self.send(payload)).status, 413)


class ConfigurationTest(unittest.TestCase):
    def test_missing_key_fails_closed(self):
        with self.assertRaises(ValueError):
            create_app("unused", "short")


if __name__ == "__main__":
    unittest.main()
