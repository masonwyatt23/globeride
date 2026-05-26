/**
 * handlebarGestures.test.ts
 *
 * Tests for the pure gesture-detection logic in handlebarGestures.ts.
 *
 * We run in Node (no DOM), so we use a minimal stub element that holds
 * listeners and lets the tests fire synthetic PointerEvents via a small
 * `fire()` helper.  This tests only the gesture-detection logic — the
 * actual browser pointer-event plumbing is exercised in manual QA.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachGestures } from '@/lib/handlebarGestures';

// ---------------------------------------------------------------------------
// Stub element — an HTMLElement-like object that supports add/removeEventListener.
// We only need the listener map; no rendering or layout.
// ---------------------------------------------------------------------------

type Listener = (e: PointerEvent) => void;

function makeStubElement() {
  const listeners: Record<string, Listener[]> = {};

  const el = {
    addEventListener(type: string, fn: Listener) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
    },
    // Test helper — dispatch a synthetic event to all registered listeners.
    _fire(type: string, overrides: Partial<PointerEvent> = {}) {
      const base: Partial<PointerEvent> = {
        pointerId: 1,
        clientX: 100,
        clientY: 200,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...overrides,
      };
      for (const fn of listeners[type] ?? []) {
        fn(base as PointerEvent);
      }
    },
  };

  return el;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance fake timers by ms. */
async function tick(ms: number) {
  vi.advanceTimersByTime(ms);
  // Let any microtasks settle.
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Double-tap tests
// ---------------------------------------------------------------------------

describe('double-tap detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // performance.now() returns 0 by default with fake timers; we'll advance
    // it by advancing the system clock.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onDoubleTap when two taps arrive within 300 ms and 30 px', () => {
    const el = makeStubElement();
    const onDoubleTap = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onDoubleTap });

    // First tap
    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    el._fire('pointerup',   { pointerId: 1, clientX: 100, clientY: 200 });

    // Second tap within window
    vi.advanceTimersByTime(150);
    el._fire('pointerdown', { pointerId: 1, clientX: 105, clientY: 202 });
    el._fire('pointerup',   { pointerId: 1, clientX: 105, clientY: 202 });

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('does NOT fire when the second tap arrives after 300 ms', () => {
    const el = makeStubElement();
    const onDoubleTap = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onDoubleTap });

    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    el._fire('pointerup',   { pointerId: 1, clientX: 100, clientY: 200 });

    // Advance beyond the double-tap window.
    vi.advanceTimersByTime(400);
    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    el._fire('pointerup',   { pointerId: 1, clientX: 100, clientY: 200 });

    expect(onDoubleTap).not.toHaveBeenCalled();
    cleanup();
  });

  it('does NOT fire when the second tap is more than 30 px away', () => {
    const el = makeStubElement();
    const onDoubleTap = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onDoubleTap });

    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    el._fire('pointerup',   { pointerId: 1, clientX: 100, clientY: 200 });

    vi.advanceTimersByTime(100);
    // 50 px away — beyond the 30 px threshold.
    el._fire('pointerdown', { pointerId: 1, clientX: 150, clientY: 200 });
    el._fire('pointerup',   { pointerId: 1, clientX: 150, clientY: 200 });

    expect(onDoubleTap).not.toHaveBeenCalled();
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// Long-press tests
// ---------------------------------------------------------------------------

describe('long-press detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress after 600 ms without movement', async () => {
    const el = makeStubElement();
    const onLongPress = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onLongPress });

    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    // Advance past 600 ms without any pointermove.
    await tick(700);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('does NOT fire onLongPress if the pointer moves more than 30 px before 600 ms', async () => {
    const el = makeStubElement();
    const onLongPress = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onLongPress });

    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    // Move 50 px — cancels the long-press.
    el._fire('pointermove',  { pointerId: 1, clientX: 150, clientY: 200 });
    await tick(700);

    expect(onLongPress).not.toHaveBeenCalled();
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// Two-finger swipe tests
// ---------------------------------------------------------------------------

describe('two-finger swipe detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onTwoFingerSwipeUp when both pointers move upward > 50 px', () => {
    const el = makeStubElement();
    const onTwoFingerSwipeUp = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onTwoFingerSwipeUp });

    // First finger down.
    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    // Second finger down.
    el._fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 300 });

    // Both fingers move up > 50 px.
    el._fire('pointermove', { pointerId: 1, clientX: 100, clientY: 240 }); // -60 px
    el._fire('pointermove', { pointerId: 2, clientX: 200, clientY: 245 }); // -55 px

    expect(onTwoFingerSwipeUp).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('fires onTwoFingerSwipeDown when both pointers move downward > 50 px', () => {
    const el = makeStubElement();
    const onTwoFingerSwipeDown = vi.fn();
    const cleanup = attachGestures(el as unknown as HTMLElement, { onTwoFingerSwipeDown });

    el._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    el._fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });

    // Both fingers move down > 50 px.
    el._fire('pointermove', { pointerId: 1, clientX: 100, clientY: 160 }); // +60 px
    el._fire('pointermove', { pointerId: 2, clientX: 200, clientY: 155 }); // +55 px

    expect(onTwoFingerSwipeDown).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
