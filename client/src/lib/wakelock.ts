// Tiny wrapper around the Screen Wake Lock API.
//
// The wake lock is dropped automatically by the platform when the page
// is hidden (tab switch, screen lock). When the page becomes visible
// again we transparently reacquire it — this is the recommended
// pattern from MDN. All of this is wrapped in feature-detection so the
// page doesn't crash on browsers that lack the API.

export interface WakeLockHandle {
  /** True while a sentinel is currently held. */
  isHeld: () => boolean;
  /** Release and stop trying to reacquire on visibility changes. */
  release: () => Promise<void>;
}

interface WakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
}

interface WakeLockAPI {
  request: (type: "screen") => Promise<WakeLockSentinel>;
}

function getWakeLockAPI(): WakeLockAPI | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { wakeLock?: WakeLockAPI }).wakeLock;
}

export function isWakeLockSupported(): boolean {
  return !!getWakeLockAPI();
}

/**
 * acquireWakeLock requests a screen wake lock and re-requests it on
 * visibilitychange (browsers drop the lock when the tab is hidden).
 *
 * Returns a handle whose .release() drops the lock and unsubscribes.
 */
export async function acquireWakeLock(): Promise<WakeLockHandle> {
  let sentinel: WakeLockSentinel | null = null;
  let stopped = false;

  const tryAcquire = async () => {
    const api = getWakeLockAPI();
    if (stopped || !api || document.visibilityState !== "visible") return;
    try {
      sentinel = await api.request("screen");
      sentinel?.addEventListener("release", () => {
        // The platform released us; don't keep a stale reference.
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") void tryAcquire();
  };
  document.addEventListener("visibilitychange", onVisibility);

  await tryAcquire();

  return {
    isHeld: () => !!sentinel && !sentinel.released,
    release: async () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        await sentinel?.release();
      } catch {
        /* ignore */
      }
      sentinel = null;
    },
  };
}
