import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { fetchBackend } from "../lib/backend-proxy.mjs";

const url = "http://fictional-backend.invalid/api/incidents";
const disconnected = () => new TypeError("do not log token-or-private-url", { cause: { code: "ECONNRESET" } });
function logs(t) {
  const entries = [];
  t.mock.method(console, "warn", value => entries.push(JSON.parse(value)));
  t.mock.method(console, "error", value => entries.push(JSON.parse(value)));
  return entries;
}

test("a reset TCP connection is retried once for GET and returns the real response", async t => {
  const entries = logs(t);
  let requests = 0;
  const server = http.createServer((req, res) => {
    if (++requests === 1) { req.socket.destroy(); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"fictional":true}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetchBackend(`http://127.0.0.1:${server.address().port}/api/incidents`, { method: "GET" }, "incidents");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fictional: true });
  assert.equal(requests, 2);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "backend_read_retry");
});

test("persistent read failure stops after two attempts with a trace ID and sanitized logs", async t => {
  const entries = logs(t);
  const mock = t.mock.method(globalThis, "fetch", async () => { throw disconnected(); });
  const res = await fetchBackend(url, { method: "GET", headers: { Authorization: "Bearer fictional-secret" } }, "incidents");
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(mock.mock.callCount(), 2);
  assert.equal(body.resultUnknown, false);
  assert.equal(body.requestId, res.headers.get("X-Brain-Request-ID"));
  assert.equal(entries[0].requestId, entries[1].requestId);
  assert.equal(entries[1].code, "ECONNRESET");
  assert.doesNotMatch(JSON.stringify(entries), /fictional-secret|private-url|invalid|Authorization/);
});

for (const method of ["POST", "PATCH"]) test(`${method} is never replayed after an uncertain response`, async t => {
  logs(t);
  const mock = t.mock.method(globalThis, "fetch", async () => { throw disconnected(); });
  const res = await fetchBackend(url, { method, body: '{"fictional":true}' }, "incidents");
  assert.equal(mock.mock.callCount(), 1);
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.resultUnknown, true);
  assert.match(body.error, /중복 요청 전에 장애 이력/);
});

test("HTTP validation and authentication failures are returned without retry", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "fictional validation" }, { status: 400 }));
  const response = await fetchBackend(url, { method: "GET" }, "incidents");
  assert.equal(response.status, 400);
  assert.equal(mock.mock.callCount(), 1);
});

test("a cancelled request is not retried or reported as a backend outage", async t => {
  const entries = logs(t), controller = new AbortController();
  controller.abort();
  const mock = t.mock.method(globalThis, "fetch", async () => { throw controller.signal.reason; });
  const res = await fetchBackend(url, { method: "GET", signal: controller.signal }, "incidents");
  assert.equal(res.status, 499);
  assert.equal((await res.json()).code, "REQUEST_CANCELLED");
  assert.equal(mock.mock.callCount(), 1);
  assert.deepEqual(entries, []);
});

test("SSE response bodies remain streaming and are not consumed by the retry helper", async t => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('id: 1\ndata: {"fictional":true}\n\n')); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } });
  t.mock.method(globalThis, "fetch", async () => response);
  const result = await fetchBackend(url + "/events", { method: "GET" }, "incidents");
  assert.equal(result, response);
  assert.equal(result.bodyUsed, false);
  assert.match(await result.text(), /id: 1/);
});
