/**
 * handlebarGestures.ts — Pure pointer-event gesture detector.
 *
 * Designed for cyclists with gloves on a phone mount.  All interactions
 * are large-target and work with both touch and mouse (pointer events unify
 * both).
 *
 * Exported surface:
 *   GestureCallbacks      — callback bag
 *   attachGestures()      — attach listeners to an element, returns cleanup fn
 *
 * Gesture definitions:
 *   double-tap   — two pointerup events within DOUBLE_TAP_MS ms, <DOUBLE_TAP_PX px apart
 *   long-press   — pointerdown held >LONG_PRESS_MS ms without moving >MOVE_THRESHOLD_PX px
 *   2-finger swipe ↑/↓ — two simultaneous pointers, both move >SWIPE_MIN_PX vertically in
 *                         the same direction within SWIPE_WINDOW_MS ms
 *
 * No third-party deps.  No preventDefault unless a gesture is actually detected
 * (to avoid breaking normal click handlers).
 */

export interface GestureCallbacks {
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onTwoFingerSwipeUp?: () => void;
  onTwoFingerSwipeDown?: () => void;
}

// ---- Tuning constants -------------------------------------------------------

const DOUBLE_TAP_MS     = 300;   // max ms between two taps
const DOUBLE_TAP_PX     = 30;    // max px movement allowed between taps
const LONG_PRESS_MS     = 600;   // ms to hold before long-press fires
const MOVE_THRESHOLD_PX = 30;    // px movement that cancels a long-press / tap
const SWIPE_MIN_PX      = 50;    // minimum vertical travel for a two-finger swipe
const SWIPE_WINDOW_MS   = 500;   // time budget for the swipe to complete

// ---- Internal types --------------------------------------------------------

interface PointerEntry {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
}

// ---- Attach function -------------------------------------------------------

/**
 * Attach gesture listeners to `el`.
 * Returns a cleanup function — call it on component unmount.
 */
export function attachGestures(el: HTMLElement, callbacks: GestureCallbacks): () => void {
  // ---- State ----
  const pointers = new Map<number, PointerEntry>();

  // Double-tap tracking
  let lastTapX    = 0;
  let lastTapY    = 0;
  let lastTapTime = 0;

  // Long-press tracking
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;

  // Two-finger swipe tracking
  let swipeTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Helpers ----

  function clearLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function clearSwipeTimer() {
    if (swipeTimer !== null) {
      clearTimeout(swipeTimer);
      swipeTimer = null;
    }
  }

  function dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }

  // ---- Handlers ----

  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      startTime: performance.now(),
    });

    // Start long-press timer only for single-finger presses.
    if (pointers.size === 1) {
      longPressFired = false;
      clearLongPress();
      longPressTimer = setTimeout(() => {
        // Confirm the pointer hasn't moved too far.
        const entry = pointers.get(e.pointerId);
        if (entry && dist(entry.startX, entry.startY, entry.currentX, entry.currentY) <= MOVE_THRESHOLD_PX) {
          longPressFired = true;
          callbacks.onLongPress?.();
        }
      }, LONG_PRESS_MS);
    } else {
      // Second finger arrived — cancel any single-finger long-press.
      clearLongPress();

      // Start a window for a two-finger swipe.
      clearSwipeTimer();
      swipeTimer = setTimeout(() => {
        // Timed out — clear pointer records so a stale 2-finger state doesn't persist.
        clearSwipeTimer();
      }, SWIPE_WINDOW_MS);
    }
  }

  function onPointerMove(e: PointerEvent) {
    const entry = pointers.get(e.pointerId);
    if (!entry) return;

    const prevX = entry.currentX;
    const prevY = entry.currentY;
    entry.currentX = e.clientX;
    entry.currentY = e.clientY;

    // Cancel long-press if the finger moved too far from its start.
    if (dist(entry.startX, entry.startY, entry.currentX, entry.currentY) > MOVE_THRESHOLD_PX) {
      clearLongPress();
    }

    // Check for two-finger swipe completion.
    if (pointers.size === 2 && callbacks.onTwoFingerSwipeUp || pointers.size === 2 && callbacks.onTwoFingerSwipeDown) {
      checkTwoFingerSwipe(prevX, prevY, e.clientX, e.clientY);
    }
  }

  function checkTwoFingerSwipe(prevX: number, prevY: number, curX: number, curY: number) {
    if (pointers.size !== 2) return;

    const entries = Array.from(pointers.values());
    const [a, b] = entries;
    if (!a || !b) return;

    // Both pointers must have moved vertically at least SWIPE_MIN_PX from their start.
    const aVertical = a.currentY - a.startY;
    const bVertical = b.currentY - b.startY;

    if (Math.abs(aVertical) < SWIPE_MIN_PX || Math.abs(bVertical) < SWIPE_MIN_PX) return;

    // Both must be going in the same vertical direction.
    const bothUp   = aVertical < 0 && bVertical < 0;
    const bothDown = aVertical > 0 && bVertical > 0;

    if (!bothUp && !bothDown) return;

    // Must be within the swipe window (swipeTimer still active).
    if (swipeTimer === null && pointers.size === 2) {
      // Timer expired — ignore.
      return;
    }

    // Fire and clear so we don't fire again for the same gesture.
    clearSwipeTimer();

    if (bothUp) {
      callbacks.onTwoFingerSwipeUp?.();
    } else {
      callbacks.onTwoFingerSwipeDown?.();
    }

    // Reset start positions so the swipe doesn't re-trigger on continued movement.
    for (const entry of pointers.values()) {
      entry.startX = entry.currentX;
      entry.startY = entry.currentY;
      entry.startTime = performance.now();
    }

    // Suppress the reference to avoid unused-var lint warning.
    void prevX;
    void prevY;
    void curX;
    void curY;
  }

  function onPointerUp(e: PointerEvent) {
    clearLongPress();

    const entry = pointers.get(e.pointerId);
    if (!entry) return;

    const wasSingleFinger = pointers.size === 1;
    pointers.delete(e.pointerId);
    clearSwipeTimer();

    // Only treat this as a tap candidate if it was a single-finger touch that
    // didn't move much and didn't trigger long-press.
    if (!wasSingleFinger || longPressFired) return;

    const moved = dist(entry.startX, entry.startY, e.clientX, e.clientY);
    if (moved > DOUBLE_TAP_PX) return;

    // Check if this is the second tap of a double-tap.
    const now = performance.now();
    const timeSinceLast = now - lastTapTime;
    const distFromLast = dist(lastTapX, lastTapY, e.clientX, e.clientY);

    if (timeSinceLast < DOUBLE_TAP_MS && distFromLast < DOUBLE_TAP_PX) {
      // Double tap!
      callbacks.onDoubleTap?.();
      // Reset so a triple tap doesn't immediately fire another double.
      lastTapTime = 0;
    } else {
      // Record this as the first tap.
      lastTapX    = e.clientX;
      lastTapY    = e.clientY;
      lastTapTime = now;
    }
  }

  function onPointerCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    clearLongPress();
    clearSwipeTimer();
  }

  // ---- Attach ----

  el.addEventListener('pointerdown',   onPointerDown);
  el.addEventListener('pointermove',   onPointerMove);
  el.addEventListener('pointerup',     onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);

  // ---- Cleanup ----

  return () => {
    el.removeEventListener('pointerdown',   onPointerDown);
    el.removeEventListener('pointermove',   onPointerMove);
    el.removeEventListener('pointerup',     onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    clearLongPress();
    clearSwipeTimer();
    pointers.clear();
  };
}
