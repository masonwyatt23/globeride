/**
 * waitForContainerSize — defers work until an element has non-zero layout dimensions.
 *
 * Landing-page Cesium scenes are lazy-loaded via React.lazy + Suspense +
 * IntersectionObserver. When the component's useEffect fires the container
 * element exists in the DOM but its parent layout may not yet be finalized,
 * causing clientHeight === 0. Cesium.Viewer constructed at that moment creates
 * a 558×0 canvas whose camera state is undefined, triggering TypeError on any
 * positionCartographic access.
 *
 * This helper uses ResizeObserver to wait until the element reports both
 * clientWidth and clientHeight above the configured thresholds before resolving.
 * Falls back to a polling-rAF loop in environments where ResizeObserver is
 * unavailable (jsdom / SSR).
 */

export interface WaitOptions {
  /** Maximum milliseconds to wait before returning null. Default 5000. */
  timeoutMs?: number;
  /** Minimum width in pixels before resolving. Default 100. */
  minWidth?: number;
  /** Minimum height in pixels before resolving. Default 100. */
  minHeight?: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Waits until `el` reports dimensions above the given thresholds.
 *
 * @returns The resolved { width, height } or `null` if the timeout elapsed.
 */
export async function waitForContainerSize(
  el: HTMLElement,
  opts?: WaitOptions,
): Promise<ContainerSize | null> {
  const timeoutMs = opts?.timeoutMs ?? 5_000;
  const minWidth = opts?.minWidth ?? 100;
  const minHeight = opts?.minHeight ?? 100;

  function dimensionsPass(w: number, h: number): boolean {
    return w >= minWidth && h >= minHeight;
  }

  // Fast path — dimensions already valid on first check.
  const initialW = el.clientWidth;
  const initialH = el.clientHeight;
  if (dimensionsPass(initialW, initialH)) {
    return { width: initialW, height: initialH };
  }

  return new Promise<ContainerSize | null>((resolve) => {
    let settled = false;
    // cleanup is assigned by whichever observation strategy is used below.
    let cleanup: () => void = () => undefined;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    }, timeoutMs);

    function finish(w: number, h: number) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ width: w, height: h });
    }

    // ---------- ResizeObserver path (browsers) ----------
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // contentRect is the layout box; fall back to client* as well.
          const w = entry.contentRect?.width ?? el.clientWidth;
          const h = entry.contentRect?.height ?? el.clientHeight;
          if (dimensionsPass(w, h)) {
            finish(w, h);
            return;
          }
        }
      });

      cleanup = () => {
        clearTimeout(timer);
        ro.disconnect();
      };

      ro.observe(el);

      // Re-read after registering the observer — the dimensions might have
      // changed between the initial check and observe() being called.
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (dimensionsPass(w, h)) {
        finish(w, h);
      }

      return;
    }

    // ---------- Polling-rAF fallback (jsdom / SSR) ----------
    let rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;

    cleanup = () => {
      clearTimeout(timer);
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    };

    function poll() {
      if (settled) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (dimensionsPass(w, h)) {
        finish(w, h);
        return;
      }
      rafHandle = requestAnimationFrame(poll);
    }

    rafHandle = requestAnimationFrame(poll);
  });
}
