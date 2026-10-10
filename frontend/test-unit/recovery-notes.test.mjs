import test from "node:test";
import assert from "node:assert/strict";
import { recoveryNotesDraft } from "../lib/recovery-notes.mjs";

const proof = { before: { healthyDependencies: false, latencyMs: 3200, errorRate: 12.5 }, after: { healthyDependencies: true, latencyMs: 120, errorRate: 0.02 }, realChanges: false, passed: true, provider: "SIMULATED_METRICS" };
test("fictional verification becomes a factual Korean draft with units", () => {
  const draft = recoveryNotesDraft(JSON.stringify(proof));
  assert.match(draft, /오류율: 12.5% → 0.02%/);
  assert.match(draft, /응답시간: 3,200ms → 120ms/);
  assert.match(draft, /의존 시스템 상태: 비정상 → 정상/);
  assert.match(draft, /실제 운영 시스템은 변경하지 않았습니다/);
});
test("failed verification is never described as successful", () => {
  assert.match(recoveryNotesDraft(JSON.stringify({ ...proof, passed: false })), /통과하지 못했습니다/);
});
test("operator notes and unrelated or malformed JSON are preserved", () => {
  for (const input of ["담당자가 확인한 가상 조치 후기", '{"memo":"사용자 기록"}', "{invalid", "", null]) assert.equal(recoveryNotesDraft(input), null);
});
test("missing or invalid metrics are not silently replaced with invented values", () => {
  for (const after of [{}, { ...proof.after, latencyMs: "120" }, { ...proof.after, errorRate: 101 }]) assert.equal(recoveryNotesDraft(JSON.stringify({ ...proof, after })), null);
});
test("unknown providers or actual changes are not relabeled as fictional", () => {
  for (const changed of [{ provider: "OTHER" }, { realChanges: true }]) assert.equal(recoveryNotesDraft(JSON.stringify({ ...proof, ...changed })), null);
});
