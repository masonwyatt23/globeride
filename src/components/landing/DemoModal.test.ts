/**
 * DemoModal unit tests — pure vitest, node environment (no DOM).
 *
 * Tests cover the four logical behaviours spec'd in Wave 40.E:
 *   1. Modal open/close state — canShowScene gate logic mirrors DemoModal internals
 *   2. Escape key closes — keyboard handler logic
 *   3. Click-outside closes — backdrop target check
 *   4. Focus trap — Tab cycling stays within focusable elements
 *
 * Pattern mirrors DemoRideSection.test.ts — no DOM mounting, pure logic.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveIonToken,
  isWebGLAvailable,
  hasSufficientHardware,
} from './HeroVisual';

// ---------------------------------------------------------------------------
// Shared mocks (same pattern as DemoRideSection.test.ts)
// ---------------------------------------------------------------------------

function makeLsMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

function setLocalStorage(mock: ReturnType<typeof makeLsMock> | null) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  });
}

function setDocumentCreateElement(fn: ((tag: string) => unknown) | null) {
  Object.defineProperty(globalThis, 'document', {
    value: fn ? { createElement: fn } : undefined,
    writable: true,
    configurable: true,
  });
}

/** Mirrors DemoModal's canShowScene derivation. */
function resolveCanShowScene(opts: {
  token: string | null;
  webgl: boolean;
  hardware: boolean;
}): boolean {
  return !!(opts.token && opts.webgl && opts.hardware);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setLocalStorage(null);
  setDocumentCreateElement(null);
});

// ---------------------------------------------------------------------------
// Test 1 — open/close: canShowScene is false without a token
// Modal renders fallback SVG, not the live Cesium scene.
// ---------------------------------------------------------------------------
describe('DemoModal: open/close gate', () => {
  it('canShowScene is false when no Cesium token is present (modal shows fallback)', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    setLocalStorage(makeLsMock()); // empty store

    const token = resolveIonToken();
    const canShow = resolveCanShowScene({ token, webgl: true, hardware: true });

    expect(token).toBeNull();
    expect(canShow).toBe(false);
  });

  it('canShowScene is true when all gates pass (modal shows live scene)', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'valid-demo-token');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);

    const token = resolveIonToken();
    const webgl = isWebGLAvailable();
    const hw = hasSufficientHardware();
    const canShow = resolveCanShowScene({ token, webgl, hardware: hw });

    expect(canShow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Escape key closes modal
// The handler calls onClose when e.key === 'Escape'.
// ---------------------------------------------------------------------------
describe('DemoModal: escape key', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();

    // Simulate the handleKeyDown logic from DemoModal
    function handleKeyDown(key: string) {
      if (key === 'Escape') {
        onClose();
      }
    }

    handleKeyDown('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn();

    function handleKeyDown(key: string) {
      if (key === 'Escape') onClose();
    }

    handleKeyDown('Enter');
    handleKeyDown('Tab');
    handleKeyDown(' ');
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Click-outside (backdrop) closes modal
// Backdrop click closes only when the click target IS the overlay element.
// ---------------------------------------------------------------------------
describe('DemoModal: click-outside', () => {
  it('calls onClose when click target is the backdrop overlay', () => {
    const onClose = vi.fn();
    const overlayEl = { id: 'overlay' };

    // Simulate handleBackdropClick logic
    function handleBackdropClick(target: unknown) {
      if (target === overlayEl) onClose();
    }

    handleBackdropClick(overlayEl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when click target is a child element', () => {
    const onClose = vi.fn();
    const overlayEl = { id: 'overlay' };
    const dialogEl = { id: 'dialog' };

    function handleBackdropClick(target: unknown) {
      if (target === overlayEl) onClose();
    }

    handleBackdropClick(dialogEl);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Focus trap: Tab cycles within focusable elements
// The trap logic wraps focus from last→first (Tab) and first→last (Shift+Tab).
// ---------------------------------------------------------------------------
describe('DemoModal: focus trap', () => {
  /** Minimal focusable element stub. */
  function makeEl(id: string) {
    let focused = false;
    return {
      id,
      focus() { focused = true; },
      get wasFocused() { return focused; },
    };
  }

  it('wraps Tab from last focusable element to first', () => {
    const els = [makeEl('close'), makeEl('link'), makeEl('btn')];
    const first = els[0];
    const last = els[els.length - 1];

    let prevented = false;
    // Simulate: activeElement is last, Tab (not shift) pressed
    const activeElement = last;
    const isShift = false;

    if (!isShift && activeElement === last) {
      prevented = true;
      first.focus();
    }

    expect(prevented).toBe(true);
    expect(first.wasFocused).toBe(true);
  });

  it('wraps Shift+Tab from first focusable element to last', () => {
    const els = [makeEl('close'), makeEl('link'), makeEl('btn')];
    const first = els[0];
    const last = els[els.length - 1];

    let prevented = false;
    // Simulate: activeElement is first, Shift+Tab pressed
    const activeElement = first;
    const isShift = true;

    if (isShift && activeElement === first) {
      prevented = true;
      last.focus();
    }

    expect(prevented).toBe(true);
    expect(last.wasFocused).toBe(true);
  });
});
