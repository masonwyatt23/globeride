/**
 * xrHandInput.test.ts — WebXR Phase 4.
 *
 * Pure-logic + DOM-event tests. We don't need a real XR runtime: the pinch
 * state machine and distance helpers are pure functions, and the session-
 * event paths can be exercised by dispatching custom events on a stub
 * EventTarget that mimics the XRSession surface we touch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  PINCH_ENTER_M,
  PINCH_EXIT_M,
  PINCH_DEBOUNCE_MS,
  computePinchState,
  createPinchState,
  jointDistance,
  subscribeHandInput,
  pinchHitsSphere,
  type PinchEvent,
  type FrameSource,
} from './xrHandInput';
import { detectXR, _resetXRCache } from './xrCapability';

// ---------------------------------------------------------------------------
// Helpers — minimal XRSession stub built on top of EventTarget
// ---------------------------------------------------------------------------

interface StubSession extends EventTarget {
  requestAnimationFrame: ReturnType<typeof vi.fn>;
  cancelAnimationFrame: ReturnType<typeof vi.fn>;
  inputSources: XRInputSource[];
}

function makeStubSession(inputSources: XRInputSource[] = []): StubSession {
  const target = new EventTarget() as StubSession;
  target.requestAnimationFrame = vi.fn(() => 1);
  target.cancelAnimationFrame = vi.fn();
  target.inputSources = inputSources;
  return target;
}

function makeDomPoint(x: number, y: number, z: number): DOMPointReadOnly {
  return { x, y, z, w: 1, toJSON: () => ({}) } as unknown as DOMPointReadOnly;
}

function setXrHandGlobal(present: boolean): void {
  if (present) {
    (globalThis as { XRHand?: unknown }).XRHand = class {};
  } else {
    delete (globalThis as { XRHand?: unknown }).XRHand;
  }
}

// ---------------------------------------------------------------------------
// detectXR.handTracking
// ---------------------------------------------------------------------------

describe('detectXR — handTracking field', () => {
  beforeEach(() => {
    _resetXRCache();
    setXrHandGlobal(false);
  });
  afterEach(() => {
    setXrHandGlobal(false);
    Object.defineProperty(globalThis.navigator, 'xr', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('returns handTracking=false when XRHand is not on the global', async () => {
    Object.defineProperty(globalThis.navigator, 'xr', {
      value: {
        isSessionSupported: vi.fn(async () => true),
        requestSession: vi.fn(),
      } as unknown as XRSystem,
      writable: true,
      configurable: true,
    });

    const cap = await detectXR();
    expect(cap.handTracking).toBe(false);
  });

  it('returns handTracking=true when XRHand is present on the global', async () => {
    setXrHandGlobal(true);
    Object.defineProperty(globalThis.navigator, 'xr', {
      value: {
        isSessionSupported: vi.fn(async () => true),
        requestSession: vi.fn(),
      } as unknown as XRSystem,
      writable: true,
      configurable: true,
    });

    const cap = await detectXR();
    expect(cap.handTracking).toBe(true);
  });

  it('returns handTracking=false cleanly when navigator.xr is absent', async () => {
    Object.defineProperty(globalThis.navigator, 'xr', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const cap = await detectXR();
    expect(cap.handTracking).toBe(false);
    expect(cap.vrSupported).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computePinchState — state machine
// ---------------------------------------------------------------------------

describe('computePinchState', () => {
  it('emits "start" when distance crosses below PINCH_ENTER_M', () => {
    const prev = createPinchState();
    const result = computePinchState(prev, PINCH_ENTER_M - 0.001, 1000);
    expect(result.transition).toBe('start');
    expect(result.state.pinching).toBe(true);
  });

  it('emits "end" when distance crosses above PINCH_EXIT_M from a pinched state', () => {
    const prev = { pinching: true, lastChangeAt: 0 };
    const result = computePinchState(prev, PINCH_EXIT_M + 0.001, 1000);
    expect(result.transition).toBe('end');
    expect(result.state.pinching).toBe(false);
  });

  it('stays pinched in the hysteresis band (between ENTER and EXIT)', () => {
    const prev = { pinching: true, lastChangeAt: 0 };
    const midway = (PINCH_ENTER_M + PINCH_EXIT_M) / 2;
    const result = computePinchState(prev, midway, 1000);
    expect(result.transition).toBeNull();
    expect(result.state.pinching).toBe(true);
  });

  it('stays unpinched in the hysteresis band when starting unpinched', () => {
    const prev = { pinching: false, lastChangeAt: 0 };
    const midway = (PINCH_ENTER_M + PINCH_EXIT_M) / 2;
    const result = computePinchState(prev, midway, 1000);
    expect(result.transition).toBeNull();
    expect(result.state.pinching).toBe(false);
  });

  it('debounces rapid oscillation within PINCH_DEBOUNCE_MS', () => {
    // Initial transition at t=1000ms.
    const first = computePinchState(createPinchState(), 0.01, 1000);
    expect(first.transition).toBe('start');
    // 10ms later (well below 50ms) — even with a wide distance the state must
    // not flip; the runtime is telling us the hand jittered.
    const second = computePinchState(first.state, 0.10, 1010);
    expect(second.transition).toBeNull();
    expect(second.state.pinching).toBe(true);
  });

  it('allows a transition once the debounce window has elapsed', () => {
    const first = computePinchState(createPinchState(), 0.01, 1000);
    const after = computePinchState(first.state, 0.10, 1000 + PINCH_DEBOUNCE_MS + 1);
    expect(after.transition).toBe('end');
  });
});

// ---------------------------------------------------------------------------
// jointDistance + pinchHitsSphere
// ---------------------------------------------------------------------------

describe('jointDistance', () => {
  it('computes Euclidean distance between two DOMPointReadOnly poses', () => {
    const a = makeDomPoint(0, 0, 0);
    const b = makeDomPoint(0.03, 0.04, 0);
    expect(jointDistance(a, b)).toBeCloseTo(0.05, 5);
  });

  it('returns +Infinity when either pose is null', () => {
    expect(jointDistance(null, makeDomPoint(0, 0, 0))).toBe(Infinity);
    expect(jointDistance(makeDomPoint(0, 0, 0), null)).toBe(Infinity);
  });
});

describe('pinchHitsSphere', () => {
  it('returns true when ray origin is within sphere radius', () => {
    const ray = {
      origin: { x: 0, y: 0, z: 0 } as PinchEvent['ray']['origin'],
      direction: { x: 0, y: 0, z: -1 } as PinchEvent['ray']['direction'],
    };
    expect(
      pinchHitsSphere(
        ray as PinchEvent['ray'],
        { x: 0.04, y: 0, z: 0 } as PinchEvent['ray']['origin'],
        0.05,
      ),
    ).toBe(true);
  });

  it('returns false when ray origin is outside sphere radius', () => {
    const ray = {
      origin: { x: 0, y: 0, z: 0 } as PinchEvent['ray']['origin'],
      direction: { x: 0, y: 0, z: -1 } as PinchEvent['ray']['direction'],
    };
    expect(
      pinchHitsSphere(
        ray as PinchEvent['ray'],
        { x: 0.20, y: 0, z: 0 } as PinchEvent['ray']['origin'],
        0.05,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subscribeHandInput — articulated-hand RAF poll
// ---------------------------------------------------------------------------

describe('subscribeHandInput — articulated hand', () => {
  it('tracks left + right hands independently', () => {
    const leftThumb = {} as XRJointSpace;
    const leftIndex = {} as XRJointSpace;
    const rightThumb = {} as XRJointSpace;
    const rightIndex = {} as XRJointSpace;

    const leftHand: XRHand = {
      size: 25,
      get: (j) => (j === 'thumb-tip' ? leftThumb : j === 'index-finger-tip' ? leftIndex : undefined),
      values: function* () { yield* []; },
    };
    const rightHand: XRHand = {
      size: 25,
      get: (j) =>
        j === 'thumb-tip' ? rightThumb : j === 'index-finger-tip' ? rightIndex : undefined,
      values: function* () { yield* []; },
    };

    const leftSource: XRInputSource = {
      handedness: 'left',
      gripSpace: null,
      targetRaySpace: {} as XRSpace,
      gamepad: null,
      targetRayMode: 'tracked-pointer',
      hand: leftHand,
    };
    const rightSource: XRInputSource = {
      handedness: 'right',
      gripSpace: null,
      targetRaySpace: {} as XRSpace,
      gamepad: null,
      targetRayMode: 'tracked-pointer',
      hand: rightHand,
    };

    const session = makeStubSession([leftSource, rightSource]);

    // The frame stub maps joint → pose. Left hand pinches; right hand is open.
    const stubMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const closedPose = (x: number) => ({
      transform: {
        position: makeDomPoint(x, 0, 0),
        orientation: makeDomPoint(0, 0, 0),
        matrix: stubMatrix,
        inverse: {} as XRRigidTransform,
      } as XRRigidTransform,
      radius: 0.01,
    });
    const frame = {
      session: session as unknown as XRSession,
      getViewerPose: () => null,
      getJointPose: (joint: XRJointSpace) => {
        if (joint === leftThumb) return closedPose(0);
        if (joint === leftIndex) return closedPose(0.01); // 10mm — pinch
        if (joint === rightThumb) return closedPose(0);
        if (joint === rightIndex) return closedPose(0.1); // 10cm — open
        return null;
      },
    } as unknown as XRFrame;

    const frameSource: FrameSource = () => frame;
    const refSpace = {} as XRReferenceSpace;
    const onPinchStart = vi.fn();
    const onPinchEnd = vi.fn();

    const unsubscribe = subscribeHandInput(
      session as unknown as XRSession,
      refSpace,
      frameSource,
      { onPinchStart, onPinchEnd },
    );

    // Drive the loop once. The stub session captures the RAF callback.
    const rafCallback = session.requestAnimationFrame.mock.calls[0][0] as (
      time: number,
      frame: XRFrame,
    ) => void;
    rafCallback(0, frame);

    expect(onPinchStart).toHaveBeenCalledTimes(1);
    expect(onPinchStart.mock.calls[0][0].handedness).toBe('left');
    expect(onPinchEnd).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('unsubscribe stops emitting events and cancels the RAF', () => {
    const session = makeStubSession();
    const frameSource: FrameSource = () => null;
    const onPinchStart = vi.fn();
    const unsubscribe = subscribeHandInput(
      session as unknown as XRSession,
      null,
      frameSource,
      { onPinchStart },
    );
    expect(session.requestAnimationFrame).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(session.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    // Subsequent unsubscribe calls are no-ops.
    unsubscribe();
    expect(session.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when frameSource returns null (tracking lost)', () => {
    const session = makeStubSession();
    const onPinchStart = vi.fn();
    subscribeHandInput(
      session as unknown as XRSession,
      {} as XRReferenceSpace,
      () => null,
      { onPinchStart },
    );

    const rafCallback = session.requestAnimationFrame.mock.calls[0][0] as (
      time: number,
      frame: XRFrame,
    ) => void;
    rafCallback(0, {
      session: session as unknown as XRSession,
      getViewerPose: () => null,
    } as XRFrame);
    expect(onPinchStart).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribeHandInput — transient-pointer fallback (Vision Pro)
// ---------------------------------------------------------------------------

describe('subscribeHandInput — transient-pointer fallback', () => {
  it('translates selectstart/selectend on a transient-pointer source into pinch events', () => {
    const stubSource: XRInputSource = {
      handedness: 'right',
      gripSpace: null,
      targetRaySpace: {} as XRSpace,
      gamepad: null,
      targetRayMode: 'transient-pointer',
    };

    const session = makeStubSession([stubSource]);
    const onPinchStart = vi.fn();
    const onPinchEnd = vi.fn();

    const unsubscribe = subscribeHandInput(
      session as unknown as XRSession,
      {} as XRReferenceSpace,
      () => null,
      { onPinchStart, onPinchEnd },
    );

    // Dispatch selectstart / selectend with the input source attached.
    const startEv = new Event('selectstart') as Event & {
      inputSource: XRInputSource;
      frame: XRFrame | null;
    };
    startEv.inputSource = stubSource;
    startEv.frame = null;
    session.dispatchEvent(startEv);

    const endEv = new Event('selectend') as Event & {
      inputSource: XRInputSource;
      frame: XRFrame | null;
    };
    endEv.inputSource = stubSource;
    endEv.frame = null;
    session.dispatchEvent(endEv);

    expect(onPinchStart).toHaveBeenCalledTimes(1);
    expect(onPinchEnd).toHaveBeenCalledTimes(1);
    expect(onPinchStart.mock.calls[0][0].handedness).toBe('right');
    unsubscribe();
  });

  it('ignores select events from non-transient-pointer sources', () => {
    const controller: XRInputSource = {
      handedness: 'left',
      gripSpace: null,
      targetRaySpace: {} as XRSpace,
      gamepad: null,
      targetRayMode: 'tracked-pointer',
    };

    const session = makeStubSession([controller]);
    const onPinchStart = vi.fn();
    subscribeHandInput(
      session as unknown as XRSession,
      {} as XRReferenceSpace,
      () => null,
      { onPinchStart },
    );

    const ev = new Event('selectstart') as Event & {
      inputSource: XRInputSource;
      frame: XRFrame | null;
    };
    ev.inputSource = controller;
    ev.frame = null;
    session.dispatchEvent(ev);

    expect(onPinchStart).not.toHaveBeenCalled();
  });
});
