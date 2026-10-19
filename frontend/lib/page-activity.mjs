export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const isIncidentProcessing = incident => ["REGISTERED", "ANALYZING", "RECOVERING"].includes(incident?.status);
export const shouldKeepLive = (visible, active, workRunning = false) => visible && (active || workRunning);

/** Track only activity transitions; repeated input never emits repeated refreshes. */
export function createActivityTracker({ onChange, now = Date.now, schedule = setTimeout, cancel = clearTimeout, initialVisible = true, idleMs = IDLE_TIMEOUT_MS }) {
  let visible = initialVisible, active = initialVisible, lastActivity = now(), timer;
  const snapshot = () => ({ visible, active });
  function publish(nextVisible, nextActive) {
    if (visible === nextVisible && active === nextActive) return;
    visible = nextVisible; active = nextActive; onChange(snapshot());
  }
  function check() {
    timer = undefined;
    if (!visible) return;
    const remaining = idleMs - (now() - lastActivity);
    if (remaining <= 0) publish(true, false);
    else timer = schedule(check, remaining);
  }
  function activity() {
    if (!visible) return;
    lastActivity = now(); publish(true, true);
    if (timer === undefined) timer = schedule(check, idleMs);
  }
  function visibility(nextVisible) {
    if (nextVisible === visible) return;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    lastActivity = now(); publish(nextVisible, nextVisible);
    if (nextVisible) timer = schedule(check, idleMs);
  }
  if (visible) timer = schedule(check, idleMs);
  return { snapshot, activity, visibility, dispose: () => { if (timer !== undefined) cancel(timer); timer = undefined; } };
}
