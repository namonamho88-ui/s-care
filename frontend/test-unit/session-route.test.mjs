import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NextRequest } from "next/server.js";
import { sessionFailure } from "../lib/session-error.mjs";

// Run the actual route without a live Next server or external authentication.
// Resolve repository aliases before executing the compiled route with NextRequest/NextResponse.
const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  transformers: { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isImportDeclaration(node)) return node;
    const specifier = node.moduleSpecifier.text;
    const resolved = specifier.startsWith("@/")
      ? new URL(`../${specifier.slice(2)}`, import.meta.url).href
      : pathToFileURL(require.resolve(specifier)).href;
    return context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, context.factory.createStringLiteral(resolved), node.attributes);
  }, context)] },
}).outputText;
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const request = (mode = "login") => new NextRequest("https://fictional-ui.invalid/api/session", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fictional-ui.invalid", Host: "fictional-ui.invalid" },
  body: JSON.stringify(mode === "admin" ? { mode, token: "fictional-admin-secret" } : { mode, login: "fictional.user", password: "fictional-password", inviteCode: "fictional-invite" }),
});

for (const status of [404, 500, 502, 503]) test(`platform HTTP ${status} is a service outage, never a credential error`, async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ status: "error", code: status, message: "Application not found; fictional-private-detail", error: "fictional-upstream-secret" }, { status }));
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Set-Cookie"), null);
  const data = await response.json();
  assert.equal(data.code, "AUTH_SERVICE_UNAVAILABLE");
  assert.match(data.error, /서버를 준비 중이거나 일시적으로 사용할 수 없습니다/);
  assert.doesNotMatch(JSON.stringify(data), /fictional|Application not found|로그인 정보를 확인/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("platform HTML errors also receive a service outage response", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>fictional-private-detail</html>", { status: 503 }));
  const response = await POST(request("admin"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AUTH_SERVICE_UNAVAILABLE");
});

for (const [status, error] of [
  [400, "비밀번호는 12~128자로 입력하세요."],
  [401, "아이디 또는 인증 정보를 확인하세요. 반복 실패 시 15분 후 다시 시도하세요."],
  [403, "이 작업을 수행할 권한이 없습니다."],
  [429, "로그인 요청이 많습니다. 잠시 후 다시 시도하세요."],
]) test(`account HTTP ${status} preserves the safe account message and status`, async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error, token: "fictional-upstream-secret" }, { status }));
  const response = await POST(request("activate"));
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("unrecognized upstream account details are never returned", () => {
  for (const status of [400, 401, 403, 429]) {
    const result = sessionFailure(status, { error: "fictional-upstream-secret", message: "fictional-private-detail" });
    assert.equal(result.status, status);
    assert.equal(typeof result.body.error, "string");
    assert.doesNotMatch(JSON.stringify(result), /fictional/);
  }
});

test("successful personal login still returns only the user and an HttpOnly cookie", async t => {
  const user = { id: "fictional-user", role: "USER" };
  t.mock.method(globalThis, "fetch", async () => Response.json({ token: "fictional-session-secret", user }));
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, user });
  assert.match(response.headers.get("Set-Cookie"), /brain_token=fictional-session-secret;.*HttpOnly/i);
});
