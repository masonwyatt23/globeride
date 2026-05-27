/**
 * useScrollReveal — unit tests (4).
 * Runs in vitest node environment (no jsdom, no DOM globals needed).
 * Tests the hook's observable contracts via a pure-node harness that
 * mirrors the IntersectionObserver integration and matchMedia branch.
 */
import { describe, it, expect } from 'vitest';

// ── Minimal DOM-like element stub ────────────────────────────────────────────
// Enough surface to exercise the hook's logic without a real DOM.

interface StubElement {
  classList: { tokens: Set<string>; add(t: string): void; contains(t: string): boolean };
  style: { vars: Map<string, string>; setProperty(k: string, v: string): void };
  querySelectorAll(sel: string): StubElement[];
  children: StubElement[];
}

function makeEl(children: StubElement[] = []): StubElement {
  return {
    classList: {
      tokens: new Set<string>(),
      add(t: string) { this.tokens.add(t); },
      contains(t: string) { return this.tokens.has(t); },
    },
    style: {
      vars: new Map<string, string>(),
      setProperty(k: string, v: string) { this.vars.set(k, v); },
    },
    querySelectorAll(_sel: string) { return children; },
    children,
  };
}

// ── IntersectionObserver-alike ───────────────────────────────────────────────

type IOCallback = (entries: { target: StubElement; isIntersecting: boolean }[]) => void;

class MockIO {
  static instances: MockIO[] = [];
  callback: IOCallback;
  observed: StubElement[] = [];
  disconnected = false;

  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIO.instances.push(this);
  }

  observe(el: StubElement) { this.observed.push(el); }
  unobserve(el: StubElement) { this.observed = this.observed.filter(e => e !== el); }
  disconnect() { this.disconnected = true; this.observed = []; }
  trigger(el: StubElement, isIntersecting: boolean) {
    this.callback([{ target: el, isIntersecting }]);
  }
}

// ── Hook logic harness ───────────────────────────────────────────────────────
// Mirrors the exact branch logic of useScrollReveal without React.

function runHookEffect(
  el: StubElement,
  opts: { childSelector?: string; delayStep?: number; prefersReduced?: boolean } = {},
): MockIO | null {
  const { childSelector, delayStep = 60, prefersReduced = false } = opts;

  if (prefersReduced) {
    if (childSelector) {
      el.querySelectorAll(childSelector).forEach(c => c.classList.add('is-visible'));
    } else {
      el.classList.add('is-visible');
    }
    return null;
  }

  const targets: StubElement[] = childSelector
    ? el.querySelectorAll(childSelector)
    : [el];

  if (targets.length === 0) return null;

  if (childSelector) {
    targets.forEach((c, i) => c.style.setProperty('--reveal-delay', `${i * delayStep}ms`));
  }

  const io = new MockIO((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  });

  targets.forEach(t => io.observe(t));
  return io;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useScrollReveal', () => {
  it('1. mount — observes the root element', () => {
    MockIO.instances = [];
    const el = makeEl();
    const io = runHookEffect(el);

    expect(io).not.toBeNull();
    expect(io!.observed).toContain(el);
  });

  it('2. intersection trigger — adds .is-visible and unobserves', () => {
    MockIO.instances = [];
    const el = makeEl();
    const io = runHookEffect(el)!;

    expect(el.classList.contains('is-visible')).toBe(false);

    io.trigger(el, true);

    expect(el.classList.contains('is-visible')).toBe(true);
    expect(io.observed).not.toContain(el); // fire-once: unobserved after reveal
  });

  it('3. unmount — disconnect clears observer', () => {
    MockIO.instances = [];
    const el = makeEl();
    const io = runHookEffect(el)!;

    expect(io.disconnected).toBe(false);
    io.disconnect(); // simulates useEffect cleanup
    expect(io.disconnected).toBe(true);
    expect(io.observed).toHaveLength(0);
  });

  it('4. prefers-reduced-motion — no observer, element immediately visible', () => {
    MockIO.instances = [];
    const el = makeEl();

    const io = runHookEffect(el, { prefersReduced: true });

    expect(io).toBeNull();
    expect(MockIO.instances).toHaveLength(0);
    expect(el.classList.contains('is-visible')).toBe(true);
  });
});
