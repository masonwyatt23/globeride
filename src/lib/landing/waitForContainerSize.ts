/**
 * waitForContainerSize — defers execution until a container element has
 * non-zero layout dimensions.
 *
 * The problem: when a component is lazy-loaded (React.lazy + IntersectionObserver
 * gate, or any deferred mount), React may call useEffect before the browser has
 * performed a layout pass on the container div. At that instant
 * `el.clientWidth === 0` and `el.clientHeight === 0`. Passing a zero-sized
 * element to `new Cesium.Viewer()` produces a black canvas that never recovers
 * because WebGL allocates a 0×0 framebuffer.
 *
 * Solution: use a ResizeObserver to wait until the element reports positive
 * content-box dimensions, then resolve. If the element already has positive
 * dimensions synchronously (the common case for full-page mounts) the promise
 * resolves on the next microtask tick to keep callers consistently async.
 *
 * @param el          The container element to observe.
 * @param timeoutMs   Hard limit in ms (default 3 000). If the container never
 *                    gets positive dimensions within this window the promise
 *                    resolves anyway — callers must guard against a still-zero
 *                    container if they care (Cesium will warn but not crash).
 *
 * @returns A promise that resolves when the element has measurable dimensions
 *          (or on timeout).
 */
export function waitForContainerSize(
  el: Element,
  { timeoutMs = 3_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  return new Promise<void>((resolve) => {
    // Fast path: already has dimensions.
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      // Resolve asynchronously so callers are always async — avoids subtle
      // ordering differences between the fast and slow paths.
      Promise.resolve().then(resolve);
      return;
    }

    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      ro.disconnect();
      clearTimeout(timer);
      resolve();
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) finish();
    });

    ro.observe(el);

    // Hard timeout so the caller is never stuck if CSS never gives this
    // element dimensions (e.g. hidden via display:none parent).
    const timer = setTimeout(finish, timeoutMs);
  });
}
