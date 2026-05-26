/**
 * xrDomOverlay.test.ts — Wave 35.C
 *
 * Unit tests for DOM overlay support utilities.
 *
 * What IS testable in jsdom:
 *   - supportsDomOverlay() returns false when navigator.xr is absent
 *   - supportsDomOverlay() returns true when navigator.xr exists
 *   - getDomOverlayInit() returns empty object for null/undefined root
 *   - getDomOverlayInit() returns { domOverlay: { root } } when xr is present
 *   - getDomOverlayInit() returns empty object when xr is absent
 *   - getDomOverlayType() returns null when domOverlayState is absent
 *   - getDomOverlayType() returns the correct type string from domOverlayState
 *
 * What is NOT testable in jsdom:
 *   - Actual compositor behaviour (head-locked / floating types require a
 *     real headset running the XR session).
 *   - Whether the browser actually honours the dom-overlay optional feature
 *     (requires navigator.xr.requestSession in a real XR context).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  supportsDomOverlay,
  getDomOverlayInit,
  getDomOverlayType,
} from './xrDomOverlay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setXr(value: unknown) {
  Object.defineProperty(globalThis.navigator, 'xr', {
    value,
    writable: true,
    configurable: true,
  });
}

function removeXr() {
  setXr(undefined);
}

// ---------------------------------------------------------------------------
// supportsDomOverlay
// ---------------------------------------------------------------------------

describe('supportsDomOverlay', () => {
  beforeEach(removeXr);
  afterEach(removeXr);

  it('returns false when navigator.xr is undefined', () => {
    expect(supportsDomOverlay()).toBe(false);
  });

  it('returns false when navigator.xr is null', () => {
    setXr(null);
    expect(supportsDomOverlay()).toBe(false);
  });

  it('returns true when navigator.xr is a truthy object (simulated XR browser)', () => {
    setXr({ isSessionSupported: () => Promise.resolve(true) });
    expect(supportsDomOverlay()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDomOverlayInit
// ---------------------------------------------------------------------------

describe('getDomOverlayInit', () => {
  beforeEach(removeXr);
  afterEach(removeXr);

  it('returns empty object when rootElement is null', () => {
    setXr({ isSessionSupported: () => Promise.resolve(true) });
    const result = getDomOverlayInit(null);
    expect(result).toEqual({});
  });

  it('returns empty object when rootElement is undefined', () => {
    setXr({ isSessionSupported: () => Promise.resolve(true) });
    const result = getDomOverlayInit(undefined);
    expect(result).toEqual({});
  });

  it('returns empty object when dom-overlay not supported (no navigator.xr)', () => {
    // No navigator.xr — supportsDomOverlay() returns false regardless of element.
    // Use a plain cast; node env has no DOM but getDomOverlayInit only checks the ref.
    const fakeEl = {} as HTMLElement;
    const result = getDomOverlayInit(fakeEl);
    expect(result).toEqual({});
  });

  it('returns { domOverlay: { root } } when xr is present and root is valid', () => {
    setXr({ isSessionSupported: () => Promise.resolve(true) });
    // Plain object cast avoids document.createElement in the node test environment.
    const fakeEl = { tagName: 'DIV' } as unknown as HTMLElement;
    const result = getDomOverlayInit(fakeEl);
    expect(result).toEqual({ domOverlay: { root: fakeEl } });
    expect((result as { domOverlay: { root: HTMLElement } }).domOverlay.root).toBe(fakeEl);
  });
});

// ---------------------------------------------------------------------------
// getDomOverlayType
// ---------------------------------------------------------------------------

describe('getDomOverlayType', () => {
  it('returns null when session has no domOverlayState', () => {
    const session = {} as XRSession;
    expect(getDomOverlayType(session)).toBeNull();
  });

  it('returns null when domOverlayState is undefined', () => {
    const session = { domOverlayState: undefined } as unknown as XRSession;
    expect(getDomOverlayType(session)).toBeNull();
  });

  it('returns "head-locked" when domOverlayState.type is head-locked', () => {
    const session = {
      domOverlayState: { type: 'head-locked' },
    } as unknown as XRSession;
    expect(getDomOverlayType(session)).toBe('head-locked');
  });

  it('returns "screen" when domOverlayState.type is screen (desktop emulation)', () => {
    const session = {
      domOverlayState: { type: 'screen' },
    } as unknown as XRSession;
    expect(getDomOverlayType(session)).toBe('screen');
  });

  it('returns "floating" when domOverlayState.type is floating', () => {
    const session = {
      domOverlayState: { type: 'floating' },
    } as unknown as XRSession;
    expect(getDomOverlayType(session)).toBe('floating');
  });
});
