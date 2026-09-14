"use client";

import { useSyncExternalStore } from "react";

/**
 * A one-second clock, shared by every countdown on the page.
 *
 * Modelled on `useNow`: the clock is an external mutable source, so it is read through
 * `useSyncExternalStore` rather than with `Date.now()` during render, which would be impure
 * and would produce a different number every time React happened to re-render.
 */
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The cached reading is only advanced by the interval, so between the last tick and a new
  // subscriber it is stale by up to a second -- and by however long the module has been
  // loaded if nothing has been watching. React re-reads the snapshot after subscribing, so
  // refreshing it here is what makes the first frame of a countdown correct.
  now = Date.now();
  if (timer === null) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Used while nothing is counting down, so an idle button does not re-render every second. */
function doNotSubscribe(): () => void {
  return () => {};
}

function getSnapshot(): number {
  return now;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Seconds remaining until `availableAt`, or 0 when there is nothing to wait for.
 *
 * Takes an absolute moment rather than a duration on purpose. The API sends a *relative*
 * number of seconds -- so that a clock skew between browser and server cannot show a wrong
 * countdown -- and the caller turns it into a deadline at the moment the response arrives,
 * which is an event, not a render. That keeps this hook a pure function of the clock.
 */
export function useCountdown(availableAt: number | null): number {
  const tick = useSyncExternalStore(
    availableAt === null ? doNotSubscribe : subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (availableAt === null || tick === null) return 0;
  return Math.max(0, Math.ceil((availableAt - tick) / 1000));
}
