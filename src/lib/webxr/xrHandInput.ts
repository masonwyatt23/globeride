/**
 * xrHandInput.ts — WebXR Phase 4: hand-tracking pinch detection.
 *
 * Two input paths are unified behind a single callback API:
 *
 *   1. Articulated hand input (Quest 2/3 / Pico):
 *      `XRInputSource.hand` is an `XRHand` mapping joint name → XRJointSpace.
 *      Each frame we read thumb-tip and index-tip positions in the reference
 *      space and treat distance < PINCH_ENTER_M as pinchStart, distance >
 *      PINCH_EXIT_M as pinchEnd. The hysteresis gap and a 50 ms cooldown
 *      prevent jitter at the boundary.
 *
 *   2. Transient-pointer fallback (Vision Pro Safari):
 *      The runtime fires `'selectstart' / 'selectend'` events on the session
 *      and exposes the pinch as an XRInputSource with
 *      `targetRayMode === 'transient-pointer'`. No per-joint info is
 *      available — we surface the target-ray origin as the pinch ray.
 *
 * Public API:
 *   - subscribeHandInput(session, refSpace, frameSource, callbacks)
 *       Returns an unsubscribe function. Idempotent on multiple calls.
 *   - computePinchState(prev, distance) — pure state-machine step (testable).
 *   - PINCH_ENTER_M, PINCH_EXIT_M — exported for tests / docs.
 *
 * Pure where possible: the state-machine + distance math are exported
 * standalone functions so tests can exercise them without a full XRSession.
 *
 * Spec: https://www.w3.org/TR/webxr-hand-input-1/#pinch-gesture-non-normative
 */

import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Tunables — exported so tests can reference the exact thresholds.
// ---------------------------------------------------------------------------

/** Distance below which a pinch is considered active (~25 mm spec heuristic). */
export const PINCH_ENTER_M = 0.025;
/** Distance above which a pinch ends. Gap from ENTER provides hysteresis. */
export const PINCH_EXIT_M = 0.035;
/**
 * Minimum time between state changes for the same hand. Below this we treat
 * subsequent distance readings as noise and ignore them. ~50 ms matches the
 * spec note on debouncing pinch events at high frame rates.
 */
export const PINCH_DEBOUNCE_MS = 50;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Strict subset of XRHandedness used by pinch events (transient-pointers default to 'right'). */
export type PinchHandedness = 'left' | 'right';

/**
 * A pinch event. The ray gives a world-space line from the pinch origin
 * pointing forward; HUD hit-testing uses the origin for sphere-collision
 * and the direction for hover indicators / future ray-cast targets.
 */
export interface PinchEvent {
  handedness: PinchHandedness;
  ray: {
    origin: Cesium.Cartesian3;
    direction: Cesium.Cartesian3;
  };
}

/** Callbacks consumed by subscribeHandInput. All are optional. */
export interface HandInputCallbacks {
  onPinchStart?: (event: PinchEvent) => void;
  onPinchEnd?: (event: PinchEvent) => void;
  /**
   * Fired each frame for the index-tip (or transient pointer target-ray
   * origin) of every tracked hand. Consumers can use it to render a
   * proximity glow on HUD buttons. Throttled to ~20 Hz internally.
   */
  onHover?: (event: PinchEvent) => void;
}

/**
 * Per-hand state tracked by the state machine. Exported for tests.
 */
export interface PinchState {
  pinching: boolean;
  /** Timestamp of the last state change (ms via performance.now()). */
  lastChangeAt: number;
}

/**
 * A frame source — anything that can hand us an XRFrame so the per-frame
 * joint pose read can happen on the XR RAF loop. Returning null pauses the
 * pinch detection (tracking lost) without disconnecting.
 */
export type FrameSource = () => XRFrame | null;

// ---------------------------------------------------------------------------
// Pure: pinch state machine
// ---------------------------------------------------------------------------

/**
 * Compute the next pinch state given the current state and a distance reading.
 *
 * Returns the next state plus an optional transition tag — 'start' or 'end' —
 * when crossing the appropriate threshold. Hysteresis: PINCH_ENTER_M < d <
 * PINCH_EXIT_M does not change state.
 *
 * Pure: no I/O, no time of day reads other than the `now` argument.
 */
export function computePinchState(
  prev: PinchState,
  distance: number,
  now: number,
): { state: PinchState; transition: 'start' | 'end' | null } {
  // Debounce: ignore changes within PINCH_DEBOUNCE_MS of the previous change.
  if (now - prev.lastChangeAt < PINCH_DEBOUNCE_MS) {
    return { state: prev, transition: null };
  }

  if (!prev.pinching && distance < PINCH_ENTER_M) {
    return {
      state: { pinching: true, lastChangeAt: now },
      transition: 'start',
    };
  }
  if (prev.pinching && distance > PINCH_EXIT_M) {
    return {
      state: { pinching: false, lastChangeAt: now },
      transition: 'end',
    };
  }
  // Hysteresis band — no change.
  return { state: prev, transition: null };
}

/**
 * Initial per-hand state. Exported so tests/callers can seed deterministic
 * starting conditions.
 */
export function createPinchState(): PinchState {
  return { pinching: false, lastChangeAt: -PINCH_DEBOUNCE_MS };
}

// ---------------------------------------------------------------------------
// Pure: joint distance
// ---------------------------------------------------------------------------

/**
 * Compute the Euclidean distance between two `DOMPointReadOnly` positions
 * (as returned by `XRRigidTransform.position`). Returns +Infinity when either
 * pose is null/undefined so the caller treats the hand as "not pinching".
 */
export function jointDistance(
  a: DOMPointReadOnly | undefined | null,
  b: DOMPointReadOnly | undefined | null,
): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

// ---------------------------------------------------------------------------
// Internal helpers — pose → world-space ray
// ---------------------------------------------------------------------------

/**
 * Convert an XRRigidTransform pose into a Cesium-compatible ray. Position is
 * passed through as a Cartesian3; direction is the pose's local -Z axis
 * (XR convention for "forward" / "pointing away from the user") extracted
 * from the column-major matrix.
 *
 * Note: positions are in reference-space metres, not ECEF. HUD hit-testing
 * in xrDomOverlay computes screen-space proximity, so absolute units don't
 * matter as long as both sides agree.
 */
function poseToRay(transform: XRRigidTransform): PinchEvent['ray'] {
  const m = transform.matrix;
  // Forward axis (negative-Z column).
  const dir = new Cesium.Cartesian3(-m[8], -m[9], -m[10]);
  Cesium.Cartesian3.normalize(dir, dir);
  return {
    origin: new Cesium.Cartesian3(
      transform.position.x,
      transform.position.y,
      transform.position.z,
    ),
    direction: dir,
  };
}

/** narrow XRHandedness → PinchHandedness, mapping 'none' → 'right' for transient pointers. */
function narrowHandedness(h: XRHandedness): PinchHandedness {
  return h === 'left' ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// subscribeHandInput
// ---------------------------------------------------------------------------

/**
 * Subscribe to pinch + hover events for every tracked input source on the
 * given session. Handles both articulated-hand and transient-pointer paths.
 *
 * The caller drives per-frame polling by passing a `frameSource` — the XR
 * RAF loop in xrSession.ts holds the live XRFrame; we read it once per call.
 * If frameSource returns null (no frame yet / tracking lost), the per-frame
 * joint poll is skipped but transient-pointer events still fire.
 *
 * @param session     Active XRSession returned by enterVR()/enterAR().
 * @param refSpace    The reference space used for the XR render loop.
 * @param frameSource Synchronous accessor for the latest XRFrame.
 * @param callbacks   Pinch + hover callbacks. All optional.
 * @returns           Unsubscribe function. Idempotent; safe to call twice.
 */
export function subscribeHandInput(
  session: XRSession,
  refSpace: XRReferenceSpace | null,
  frameSource: FrameSource,
  callbacks: HandInputCallbacks,
): () => void {
  const states = new Map<PinchHandedness, PinchState>();
  let unsubscribed = false;
  let rafId = 0;
  let lastHoverAt = 0;
  // Map from XRInputSource → handedness used at session-event time (the source
  // is removed by the time selectend fires, so we cache the lookup).
  const transientPointers = new WeakMap<XRInputSource, PinchHandedness>();

  function stateFor(hand: PinchHandedness): PinchState {
    let s = states.get(hand);
    if (!s) {
      s = createPinchState();
      states.set(hand, s);
    }
    return s;
  }

  function emitTransition(
    hand: PinchHandedness,
    transition: 'start' | 'end',
    ray: PinchEvent['ray'],
  ) {
    const event: PinchEvent = { handedness: hand, ray };
    if (transition === 'start') callbacks.onPinchStart?.(event);
    else callbacks.onPinchEnd?.(event);
  }

  // -- Articulated hand path: per-frame joint poll ------------------------

  function pollFrame() {
    if (unsubscribed) return;
    rafId = session.requestAnimationFrame(pollFrame);

    const frame = frameSource();
    if (!frame || !refSpace) return;
    const getJointPose = frame.getJointPose;
    if (!getJointPose) return; // hand-tracking not granted for this session

    const now = performance.now();

    for (const source of session.inputSources) {
      if (!source.hand || source.handedness === 'none') continue;
      const handedness = narrowHandedness(source.handedness);
      const thumb = source.hand.get('thumb-tip');
      const index = source.hand.get('index-finger-tip');
      if (!thumb || !index) continue;

      const thumbPose = getJointPose.call(frame, thumb, refSpace);
      const indexPose = getJointPose.call(frame, index, refSpace);
      if (!thumbPose || !indexPose) continue;

      const distance = jointDistance(
        thumbPose.transform.position,
        indexPose.transform.position,
      );

      const prev = stateFor(handedness);
      const { state, transition } = computePinchState(prev, distance, now);
      states.set(handedness, state);

      if (transition) {
        emitTransition(handedness, transition, poseToRay(indexPose.transform));
      }

      // Throttle hover to ~20 Hz to keep React renders cheap.
      if (callbacks.onHover && now - lastHoverAt > 50) {
        lastHoverAt = now;
        callbacks.onHover({
          handedness,
          ray: poseToRay(indexPose.transform),
        });
      }
    }
  }

  // -- Transient-pointer path: Vision Pro Safari --------------------------

  function rememberTransient(source: XRInputSource) {
    if (source.targetRayMode === 'transient-pointer') {
      transientPointers.set(source, narrowHandedness(source.handedness));
    }
  }

  for (const src of session.inputSources) rememberTransient(src);

  const onInputSourcesChange = (event: XRInputSourcesChangeEvent) => {
    for (const src of event.added) rememberTransient(src);
  };

  const onSelectStart = (event: XRInputSourceEvent) => {
    const source = event.inputSource;
    if (source.targetRayMode !== 'transient-pointer') return;
    const handedness = transientPointers.get(source) ?? narrowHandedness(source.handedness);
    const frame = event.frame;
    let ray: PinchEvent['ray'] = {
      origin: new Cesium.Cartesian3(0, 0, 0),
      direction: new Cesium.Cartesian3(0, 0, -1),
    };
    if (frame && refSpace) {
      const pose = frame.getViewerPose(refSpace);
      if (pose) ray = poseToRay(pose.transform);
    }
    emitTransition(handedness, 'start', ray);
    states.set(handedness, { pinching: true, lastChangeAt: performance.now() });
  };

  const onSelectEnd = (event: XRInputSourceEvent) => {
    const source = event.inputSource;
    if (source.targetRayMode !== 'transient-pointer') return;
    const handedness = transientPointers.get(source) ?? narrowHandedness(source.handedness);
    const frame = event.frame;
    let ray: PinchEvent['ray'] = {
      origin: new Cesium.Cartesian3(0, 0, 0),
      direction: new Cesium.Cartesian3(0, 0, -1),
    };
    if (frame && refSpace) {
      const pose = frame.getViewerPose(refSpace);
      if (pose) ray = poseToRay(pose.transform);
    }
    emitTransition(handedness, 'end', ray);
    states.set(handedness, { pinching: false, lastChangeAt: performance.now() });
  };

  // XRSession's typed event overloads don't satisfy EventTarget's listener
  // signature (Event vs XRInputSource*Event); cast to EventListener here so
  // we keep the parameter types meaningful inside the handlers.
  session.addEventListener('inputsourceschange', onInputSourcesChange as EventListener);
  session.addEventListener('selectstart', onSelectStart as EventListener);
  session.addEventListener('selectend', onSelectEnd as EventListener);

  // Kick off the articulated-hand RAF poll. If hand-tracking is unavailable
  // the loop is a near-no-op (early return inside pollFrame); cheap enough to
  // run unconditionally rather than gating on capability detection.
  rafId = session.requestAnimationFrame(pollFrame);

  return function unsubscribe() {
    if (unsubscribed) return;
    unsubscribed = true;
    try {
      session.cancelAnimationFrame(rafId);
    } catch {
      // Session already ended — frame was already cancelled.
    }
    session.removeEventListener('inputsourceschange', onInputSourcesChange as EventListener);
    session.removeEventListener('selectstart', onSelectStart as EventListener);
    session.removeEventListener('selectend', onSelectEnd as EventListener);
    states.clear();
  };
}

/**
 * Heuristic Cartesian-distance hit test between a pinch ray origin and a
 * world-space sphere center. Returns true if `||origin - center||` is within
 * `radius`. Used by xrDomOverlay to map pinches onto HUD button centers.
 *
 * Pure: exported for tests.
 */
export function pinchHitsSphere(
  ray: PinchEvent['ray'],
  center: Cesium.Cartesian3,
  radius: number,
): boolean {
  const dx = ray.origin.x - center.x;
  const dy = ray.origin.y - center.y;
  const dz = ray.origin.z - center.z;
  return Math.hypot(dx, dy, dz) <= radius;
}
