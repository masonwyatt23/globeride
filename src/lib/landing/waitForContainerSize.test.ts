/**
 * Tests for waitForContainerSize.
 *
 * Environment: node (vitest). ResizeObserver and requestAnimationFrame are
 * not available in node, so we inject mocks via globalThis before each test
 * and restore them after.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForContainerSize } from './waitForContainerSize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEl(width: number, height: number): HTMLElement {
  return {
    clientWidth: width,
    clientHeight: height,
  } as unknown as HTMLElement;
}

type ROCallback = (entries: ResizeObserverEntry[]) => void;

function makeROEntry(el: HTMLElement, w: number, h: number): ResizeObserverEntry {
  return {
    target: el,
    contentRect: { width: w, height: h } as DOMRectReadOnly,
  } as unknown as ResizeObserverEntry;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('waitForContainerSize', () => {
  let originalRO: typeof globalThis.ResizeObserver | undefined;
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;
  let originalCAF: typeof globalThis.cancelAnimationFrame | undefined;

  beforeEach(() => {
    originalRO = (globalThis as Record<string, unknown>).ResizeObserver as typeof globalThis.ResizeObserver | undefined;
    originalRAF = (globalThis as Record<string, unknown>).requestAnimationFrame as typeof globalThis.requestAnimationFrame | undefined;
    originalCAF = (globalThis as Record<string, unknown>).cancelAnimationFrame as typeof globalThis.cancelAnimationFrame | undefined;

    // Remove ResizeObserver and rAF so tests start from a clean slate.
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
    delete (globalThis as Record<string, unknown>).cancelAnimationFrame;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    if (originalRO !== undefined) {
      (globalThis as Record<string, unknown>).ResizeObserver = originalRO;
    } else {
      delete (globalThis as Record<string, unknown>).ResizeObserver;
    }
    if (originalRAF !== undefined) {
      (globalThis as Record<string, unknown>).requestAnimationFrame = originalRAF;
    }
    if (originalCAF !== undefined) {
      (globalThis as Record<string, unknown>).cancelAnimationFrame = originalCAF;
    }
  });

  // -------------------------------------------------------------------------
  // 1. Resolves immediately when initial dimensions already pass
  // -------------------------------------------------------------------------
  it('resolves immediately when initial dimensions already pass', async () => {
    const el = makeEl(400, 300);
    const result = await waitForContainerSize(el, { minWidth: 100, minHeight: 100 });
    expect(result).toEqual({ width: 400, height: 300 });
  });

  // -------------------------------------------------------------------------
  // 2. Resolves later when ResizeObserver fires with valid dimensions
  // -------------------------------------------------------------------------
  it('resolves when ResizeObserver fires with valid dimensions', async () => {
    const el = makeEl(0, 0); // starts as zero — does not pass fast path

    let capturedCallback: ROCallback | null = null;

    class MockRO {
      constructor(cb: ROCallback) { capturedCallback = cb; }
      observe(_el: HTMLElement) {
        // Simulate dimension read after observe — still 0 in this test.
      }
      disconnect() {}
    }

    (globalThis as Record<string, unknown>).ResizeObserver = MockRO;

    const promise = waitForContainerSize(el, { minWidth: 100, minHeight: 100 });

    // Fire the observer with valid dimensions.
    expect(capturedCallback).not.toBeNull();
    capturedCallback!([makeROEntry(el, 500, 400)]);

    const result = await promise;
    expect(result).toEqual({ width: 500, height: 400 });
  });

  // -------------------------------------------------------------------------
  // 3. Returns null when timeout elapses without valid dimensions
  // -------------------------------------------------------------------------
  it('returns null when timeout elapses', async () => {
    const el = makeEl(0, 0);

    class MockRO {
      constructor(_cb: ROCallback) {}
      observe(_el: HTMLElement) {}
      disconnect() {}
    }

    (globalThis as Record<string, unknown>).ResizeObserver = MockRO;

    const promise = waitForContainerSize(el, { timeoutMs: 3_000, minWidth: 100, minHeight: 100 });

    // Advance past the timeout.
    vi.advanceTimersByTime(3_001);

    const result = await promise;
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. Falls back to polling-rAF loop when ResizeObserver is unavailable
  // -------------------------------------------------------------------------
  it('falls back to polling rAF when ResizeObserver is not defined', async () => {
    // ResizeObserver already deleted in beforeEach. Set up rAF mock.
    let frameCallback: FrameRequestCallback | null = null;
    let handle = 0;

    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      frameCallback = cb;
      return ++handle;
    };
    (globalThis as Record<string, unknown>).cancelAnimationFrame = vi.fn();

    const el = makeEl(0, 0);
    const promise = waitForContainerSize(el, { minWidth: 100, minHeight: 100, timeoutMs: 5_000 });

    // First rAF fires — still 0×0.
    expect(frameCallback).not.toBeNull();
    frameCallback!(0);

    // Now simulate the container getting sized before the next frame.
    el.clientWidth = 800 as unknown as number;
    (el as unknown as Record<string, unknown>).clientWidth = 800;
    (el as unknown as Record<string, unknown>).clientHeight = 600;

    // Second rAF fires — dimensions pass now.
    expect(frameCallback).not.toBeNull();
    frameCallback!(16);

    const result = await promise;
    expect(result).toEqual({ width: 800, height: 600 });
  });

  // -------------------------------------------------------------------------
  // 5. Resolves immediately when dimensions already pass on first check (fast path)
  //    even with ResizeObserver available
  // -------------------------------------------------------------------------
  it('resolves immediately via fast path even when ResizeObserver is available', async () => {
    const el = makeEl(300, 200);
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();

    class MockRO {
      constructor(_cb: ROCallback) {}
      observe = observeSpy;
      disconnect = disconnectSpy;
    }

    (globalThis as Record<string, unknown>).ResizeObserver = MockRO;

    const result = await waitForContainerSize(el, { minWidth: 100, minHeight: 100 });
    expect(result).toEqual({ width: 300, height: 200 });
    // Fast path resolves before observe is ever called.
    expect(observeSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Respects custom minWidth / minHeight thresholds
  // -------------------------------------------------------------------------
  it('respects custom minWidth and minHeight thresholds', async () => {
    // 50×50 — passes default 1×1 but not custom 100×100.
    const el = makeEl(50, 50);
    let capturedCallback: ROCallback | null = null;

    class MockRO {
      constructor(cb: ROCallback) { capturedCallback = cb; }
      observe(_el: HTMLElement) {}
      disconnect() {}
    }

    (globalThis as Record<string, unknown>).ResizeObserver = MockRO;

    const promise = waitForContainerSize(el, { minWidth: 100, minHeight: 100, timeoutMs: 5_000 });

    // Fire with dimensions that pass the custom thresholds.
    capturedCallback!([makeROEntry(el, 400, 300)]);

    const result = await promise;
    expect(result).toEqual({ width: 400, height: 300 });
  });
});
