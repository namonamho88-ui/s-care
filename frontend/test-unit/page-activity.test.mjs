import test from "node:test";
import assert from "node:assert/strict";
import { createActivityTracker, IDLE_TIMEOUT_MS, isIncidentProcessing, shouldKeepLive } from "../lib/page-activity.mjs";

function fixture(initialVisible = true) {
  let time = 0, id = 0;
  const timers = new Map(), changes = [];
  const tracker = createActivityTracker({ initialVisible, now: () => time, onChange: state => changes.push(state), schedule: (fn, ms) => { timers.set(++id, { fn, at: time + ms }); return id; }, cancel: key => timers.delete(key) });
  const advance = ms => {
    const end = time + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  };
  return { tracker, changes, timers, advance };
}

test("a visible unused page becomes idle after five minutes", () => {
  const f = fixture(); f.advance(IDLE_TIMEOUT_MS - 1);
  assert.deepEqual(f.changes, []); f.advance(1);
  assert.deepEqual(f.changes, [{ visible: true, active: false }]);
  assert.equal(f.timers.size, 0);
});

test("repeated input extends the idle deadline without emitting refresh transitions", () => {
  const f = fixture(); f.advance(IDLE_TIMEOUT_MS - 1000);
  for (let i = 0; i < 100; i++) f.tracker.activity();
  assert.equal(f.timers.size, 1); assert.equal(f.changes.length, 0);
  f.advance(1000); assert.equal(f.changes.length, 0);
  f.advance(IDLE_TIMEOUT_MS - 1000); assert.equal(f.changes.length, 1);
  f.tracker.activity(); f.tracker.activity();
  assert.deepEqual(f.changes.at(-1), { visible: true, active: true });
  assert.equal(f.changes.length, 2);
});

test("hidden tabs stop immediately and a return emits a single resume", () => {
  const f = fixture(); f.tracker.visibility(false); f.tracker.activity();
  assert.equal(f.timers.size, 0); f.advance(IDLE_TIMEOUT_MS * 2);
  assert.deepEqual(f.changes, [{ visible: false, active: false }]);
  f.tracker.visibility(true); f.tracker.visibility(true); f.tracker.activity();
  assert.equal(f.changes.length, 2); assert.equal(f.timers.size, 1);
});

test("visible analysis continues until completion while hidden pages always stop", () => {
  for (const status of ["REGISTERED", "ANALYZING", "RECOVERING"]) {
    const running = isIncidentProcessing({ status });
    assert.equal(running, true); assert.equal(shouldKeepLive(true, false, running), true);
    assert.equal(shouldKeepLive(false, true, running), false);
  }
  for (const status of ["WAITING_APPROVAL", "NEEDS_REVIEW", "RESOLVED", "CLOSED", "CANCELLED", "FAILED"]) {
    assert.equal(shouldKeepLive(true, false, isIncidentProcessing({ status })), false);
  }
});

test("initially hidden pages and unmounted trackers keep no timers", () => {
  const hidden = fixture(false); assert.equal(hidden.timers.size, 0);
  const visible = fixture(); visible.tracker.dispose(); visible.advance(IDLE_TIMEOUT_MS);
  assert.equal(visible.timers.size, 0); assert.deepEqual(visible.changes, []);
});
