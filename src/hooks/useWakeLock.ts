import { useEffect, useRef } from 'react';

/**
 * Keep the screen awake during a ride. Silently no-ops on unsupported
 * browsers (Safari iOS supports it as of 16.4, Chrome since 84).
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: WakeLock };
    if (!nav.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          lock.release().catch(() => undefined);
          return;
        }
        lockRef.current = lock;
        lock.addEventListener('release', () => {
          lockRef.current = null;
        });
      } catch {
        /* user gesture / visibility / permissions — ignore */
      }
    };

    const release = () => {
      lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
    };

    if (active) acquire();
    else release();

    const onVis = () => {
      if (active && document.visibilityState === 'visible' && !lockRef.current) acquire();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
  }, [active]);
}
