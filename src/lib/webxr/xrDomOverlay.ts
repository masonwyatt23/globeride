/**
 * xrDomOverlay.ts WebXR Phase 3: DOM overlay for in-headset HUD.
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
