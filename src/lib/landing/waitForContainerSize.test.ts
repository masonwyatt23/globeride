/**
 * waitForContainerSize — unit tests.
 *
 * All DOM interactions are mocked — no real browser layout engine required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForContainerSize } from './waitForContainerSize';

// ── ResizeObserver mock ───────────────────────────────────────────────────────
// jsdom does not implement ResizeObserver. We provide a manual mock that
// captures the callback and lets tests fire it with arbitrary ContentRect data.

type ROCallback = (entries: ResizeObserverEntry[]) => void;

let capturedCallbacks: ROCallback[] = [];

class MockResizeObserver {
  private cb: ROCallback;
  constructor(cb: ROCallback) {
    this.cb = cb;
    capturedCallbacks.push(cb);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function fireMockRO(width: number, height: number) {
  const entry = {
    contentRect: { width, height } as DOMRectReadOnly,
  } as ResizeObserverEntry;
  capturedCallbacks.forEach((cb) => cb([entry]));
}

beforeEach(() => {
  capturedCallbacks = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEl(width: number, height: number): Element {
  return {
    clientWidth: width,
    clientHeight: height,
  } as unknown as Element;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('waitForContainerSize', () => {
  it('resolves on the next microtask when the element already has positive dimensions', async () => {
    const el = makeEl(300, 200);
    await expect(waitForContainerSize(el)).resolves.toBeUndefined();
  });

  it('resolves asynchronously (not synchronously) even in the fast path', () => {
    const el = makeEl(300, 200);
    let resolved = false;
    const p = waitForContainerSize(el).then(() => { resolved = true; });
    // Synchronously, promise should NOT have resolved yet.
    expect(resolved).toBe(false);
    return p; // wait for it to finish
  });

  it('resolves when ResizeObserver fires with positive dimensions', async () => {
    const el = makeEl(0, 0); // starts zero-sized
    const p = waitForContainerSize(el);

    // Not yet resolved.
    let resolved = false;
    void p.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Fire ResizeObserver with positive rect.
    fireMockRO(320, 200);
    await p;
    expect(resolved).toBe(true);
  });

  it('does NOT resolve when ResizeObserver fires with zero dimensions', async () => {
    vi.useFakeTimers();
    const el = makeEl(0, 0);
    const p = waitForContainerSize(el, { timeoutMs: 500 });

    let resolved = false;
    void p.then(() => { resolved = true; });

    // Fire with zero height — should be ignored.
    fireMockRO(320, 0);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Fire with zero width — should also be ignored.
    fireMockRO(0, 200);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Advance timer to trigger timeout resolution.
    vi.advanceTimersByTime(600);
    await p;
    expect(resolved).toBe(true);
  });

  it('resolves on timeout if the container never gets dimensions', async () => {
    vi.useFakeTimers();
    const el = makeEl(0, 0);
    const p = waitForContainerSize(el, { timeoutMs: 100 });

    let resolved = false;
    void p.then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(150);
    await p;
    expect(resolved).toBe(true);
  });

  it('does not resolve twice when both ResizeObserver and timeout fire', async () => {
    vi.useFakeTimers();
    const el = makeEl(0, 0);
    let callCount = 0;
    const p = waitForContainerSize(el, { timeoutMs: 100 }).then(() => { callCount++; });

    // Fire ResizeObserver first.
    fireMockRO(300, 200);
    await Promise.resolve();

    // Then advance timer past the timeout — should not resolve again.
    vi.advanceTimersByTime(200);
    await p;
    expect(callCount).toBe(1);
  });

  it('accepts a custom timeoutMs option', async () => {
    vi.useFakeTimers();
    const el = makeEl(0, 0);

    let resolved = false;
    const p = waitForContainerSize(el, { timeoutMs: 50 }).then(() => { resolved = true; });

    vi.advanceTimersByTime(40);
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(20); // total 60ms > 50ms timeout
    await p;
    expect(resolved).toBe(true);
  });
});
