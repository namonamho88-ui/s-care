"use client";
import { useEffect, useState } from "react";
import { createActivityTracker, shouldKeepLive } from "@/lib/page-activity.mjs";

export function usePageActivity(workRunning = false) {
  const [state, setState] = useState({ visible: true, active: true });
  useEffect(() => {
    const tracker = createActivityTracker({ onChange: setState, initialVisible: !document.hidden });
    setState(tracker.snapshot());
    const visibility = () => tracker.visibility(!document.hidden);
    // Automatic focus/scrollIntoView must not keep an abandoned screen awake.
    const activity = (event: Event) => { if (event.isTrusted) tracker.activity(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "touchmove", "input"];
    for (const event of events) document.addEventListener(event, activity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      tracker.dispose();
      for (const event of events) document.removeEventListener(event, activity, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return shouldKeepLive(state.visible, state.active, workRunning);
}
