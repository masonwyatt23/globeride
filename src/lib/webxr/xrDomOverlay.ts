/**
 * xrDomOverlay.ts WebXR Phase 3 + Phase 4: DOM overlay for in-headset HUD.
 *
 * WebXR DOM Overlays feature (W3C spec):
 *   https://immersive-web.github.io/dom-overlays/
 *
 * What it does:
 *   When `dom-overlay` is listed in optionalFeatures AND `domOverlay.root` is
 *   set in the XRSessionInit, the browser/headset compositor renders the
 *   specified DOM subtree directly on top of the stereo XR frames. On Quest
 *   (Chrome / Wolvic) it appears as a head-locked or floating transparent
 *   overlay. On Vision Pro Safari (visionOS 2+) support is partial — may fall
 *   back to screen type.
 *
 * Key browser/headset compatibility notes:
 *   - Quest 2/3 (Chrome 120+, Wolvic): full support, `type = 'head-locked'`
 *   - Quest Browser (Meta Quest Browser 30+): supported
 *   - Chrome on desktop with emulated XR: `type = 'screen'`
 *   - Vision Pro Safari: partial — overlay may not compose in-headset
 *   - Firefox Reality: not supported
 *
 * Fallback strategy: all functions are side-effect-free and degrade silently.
 * If `dom-overlay` is not in `session.enabledFeatures`, getDomOverlayType()
 * returns null and the Cesium primitive HUD remains the fallback.
 */

// ---------------------------------------------------------------------------
// supportsDomOverlay
// ---------------------------------------------------------------------------

/**
 * Returns true if the current browser is likely to honour the `dom-overlay`
 * optional feature in an XRSessionInit.
 *
 * Detection approach:
 *   There is no direct `navigator.xr.supportsFeature('dom-overlay')` call in
 *   the spec. The standard pattern is to include it in optionalFeatures and
 *   check `session.domOverlayState` after session creation. This helper uses
 *   a conservative user-agent / Chromium heuristic that avoids requesting a
 *   full session just to test feature availability.
 *
 * In tests / jsdom: window.navigator.xr is undefined → returns false. ✓
 */
export function supportsDomOverlay(): boolean {
  // XR not available at all.
  if (typeof navigator === 'undefined' || !navigator.xr) return false;

  // The spec exposes `navigator.xr` on supported browsers. `dom-overlay` is
  // a Chromium feature added in M90. We rely on the caller passing it as an
  // optionalFeature — the session will confirm or deny it via domOverlayState.
  // We return true here to indicate "worth requesting"; the actual capability
  // confirmation is done via getDomOverlayType() after session creation.
  return true;
}

// ---------------------------------------------------------------------------
// getDomOverlayInit
// ---------------------------------------------------------------------------

/**
 * Returns the XRSessionInit fragment that enables dom-overlay, ready to be
 * spread into the requestSession options object.
 *
 * Usage in xrSession.ts:
 *   ```ts
 *   const session = await navigator.xr.requestSession('immersive-vr', {
 *     requiredFeatures: ['local-floor'],
 *     optionalFeatures: ['bounded-floor', 'hand-tracking', 'dom-overlay'],
 *     ...getDomOverlayInit(hudRootElement),
 *   });
 *   ```
 *
 * If rootElement is null/undefined or dom-overlay is not supported, returns
 * an empty object so the spread is always safe.
 *
 * @param rootElement  The root HTMLElement whose subtree the compositor
 *                     will render in-headset. Must be in the live DOM.
 */
export function getDomOverlayInit(
  rootElement: HTMLElement | null | undefined,
): { domOverlay: { root: HTMLElement } } | Record<string, never> {
  if (!rootElement) return {};
  if (!supportsDomOverlay()) return {};
  return { domOverlay: { root: rootElement } };
}

// ---------------------------------------------------------------------------
// getDomOverlayType
// ---------------------------------------------------------------------------

/**
 * After an XRSession is established, query whether the compositor actually
 * honoured the dom-overlay request and what display mode it chose.
 *
 * Returns:
 *   'screen'       — overlay displayed on a flat 2D screen (desktop emulation)
 *   'floating'     — overlay shown as a free-floating panel (some headsets)
 *   'head-locked'  — overlay fixed to headset view (Quest / most VR headsets)
 *   null           — dom-overlay was not enabled for this session
 *
 * @param session  The active XRSession returned by requestSession().
 */
export function getDomOverlayType(
  session: XRSession,
): 'screen' | 'floating' | 'head-locked' | null {
  // domOverlayState is a Phase 3 extension on XRSession (declared in webxr.d.ts).
  const state = (session as XRSession & { domOverlayState?: XRDOMOverlayState })
    .domOverlayState;
  if (!state) return null;
  return state.type ?? null;
}

// ---------------------------------------------------------------------------
// Phase 4: pinch → HUD button routing
// ---------------------------------------------------------------------------

/**
 * CSS attribute marker that opts a HUD button into Phase 4 pinch routing.
 * Any element rendered inside the dom-overlay subtree with this attribute is
 * eligible for pinch-to-tap. The attribute is read at routing time so React
 * re-renders / late-mounted buttons are picked up automatically.
 */
export const HAND_HUD_BUTTON_ATTR = 'data-xr-pinch-target';

/**
 * Default hit radius (5 cm) used when matching a pinch ray origin against a
 * HUD button's bounding sphere. Spec note: 5 cm is comfortable for tabletop /
 * head-locked HUDs; tighten via the `radiusM` arg if buttons sit closer.
 */
export const HAND_HUD_DEFAULT_RADIUS_M = 0.05;

/**
 * Hover state for a single HUD button — exposed via `data-xr-hover` attribute
 * so a sibling stylesheet (or React component) can show a ring/glow without
 * additional re-renders.
 */
function setHover(el: HTMLElement, hovered: boolean): void {
  if (hovered) el.setAttribute('data-xr-hover', 'true');
  else el.removeAttribute('data-xr-hover');
}

/**
 * A pinch-target collected from the DOM. Exposed so the routing logic can be
 * tested without a real `document`: callers build a list and pass it to the
 * pure helpers, while the DOM-aware variants below derive it from `root`.
 */
export interface HudPinchTarget {
  center: { x: number; y: number; z: number };
  el: HTMLElement;
}

/**
 * Pure: pick the closest target inside a given radius. Returns null if no
 * target is within `radiusM` of the ray origin.
 *
 * Exported for tests so the routing math can be exercised without a DOM.
 */
export function nearestHudTarget(
  targets: ReadonlyArray<HudPinchTarget>,
  ray: { origin: { x: number; y: number; z: number } },
  radiusM = HAND_HUD_DEFAULT_RADIUS_M,
): HudPinchTarget | null {
  let best: { dist: number; t: HudPinchTarget } | null = null;
  for (const t of targets) {
    const dx = t.center.x - ray.origin.x;
    const dy = t.center.y - ray.origin.y;
    const dz = t.center.z - ray.origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d <= radiusM && (!best || d < best.dist)) best = { dist: d, t };
  }
  return best?.t ?? null;
}

/**
 * Build a `HudPinchTarget[]` list of every pinch-target inside `root` from
 * the live DOM. The center is derived from each element's
 * `getBoundingClientRect()`, mapped into reference-space metres via a simple
 * pixel→metre scale (1000 px-per-metre keeps numbers in the same band as
 * PINCH_ENTER_M / PINCH_EXIT_M).
 *
 * Returns an empty array when the DOM isn't available (e.g. node test env).
 */
export function collectHudTargets(root: HTMLElement): HudPinchTarget[] {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const nodes = root.querySelectorAll<HTMLElement>(`[${HAND_HUD_BUTTON_ATTR}]`);
  const list: HudPinchTarget[] = [];
  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    list.push({
      center: {
        x: (rect.left + rect.width / 2) / 1000,
        y: (rect.top + rect.height / 2) / 1000,
        z: 0,
      },
      el,
    });
  }
  return list;
}

/**
 * Route a pinch event onto the nearest HUD button within `radiusM`. Invokes
 * `el.click()` on the winning element and returns it; returns null when no
 * target is within range.
 *
 * Exported for tests; called by xrHandInput when a `pinchStart` fires.
 */
export function routePinchToHud(
  root: HTMLElement,
  ray: { origin: { x: number; y: number; z: number } },
  radiusM = HAND_HUD_DEFAULT_RADIUS_M,
): HTMLElement | null {
  const hit = nearestHudTarget(collectHudTargets(root), ray, radiusM);
  if (!hit) return null;
  hit.el.click();
  return hit.el;
}

/**
 * Update hover indicators across all HUD pinch-targets. Marks the closest
 * target with `data-xr-hover="true"` if it's within `radiusM`; clears the
 * attribute on every other target.
 *
 * Exported for hand-input glue and tests.
 */
export function updateHudHover(
  root: HTMLElement,
  ray: { origin: { x: number; y: number; z: number } },
  radiusM = HAND_HUD_DEFAULT_RADIUS_M,
): HTMLElement | null {
  const targets = collectHudTargets(root);
  const hit = nearestHudTarget(targets, ray, radiusM);
  for (const t of targets) setHover(t.el, t.el === hit?.el);
  return hit?.el ?? null;
}
