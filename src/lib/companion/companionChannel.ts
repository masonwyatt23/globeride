/**
 * companionChannel.ts — BroadcastChannel transport for the phone companion screen.
 *
 * Both the phone and the tablet open the same channel with their respective roles.
 * The channel is same-origin (globeride.vercel.app) and requires no server.
 *
 * Protocol
 * ────────
 * Phone → Tablet:  hr · cadence · remote-control · hello · bye
 * Tablet → Phone:  workout-segment · toast · hello · bye
 *
 * Presence detection
 * ──────────────────
 * Each side posts `hello` on open. The other side can track the `t` timestamp
 * and mark the peer as "connected" until a `bye` is received or the last hello
 * is older than PRESENCE_TIMEOUT_MS.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type CompanionMessage =
  | { type: 'hr';              bpm: number;    t: number }
  | { type: 'cadence';         rpm: number;    t: number }
  | { type: 'remote-control';  action: 'pause' | 'resume' | 'lap' | 'next-segment'; t: number }
  | { type: 'hello';           role: 'phone' | 'tablet'; t: number }
  | { type: 'bye';             role: 'phone' | 'tablet'; t: number }
  | {
      type: 'workout-segment';
      t: number;
      /** Short human label for the current segment. */
      label: string;
      /** Target description, e.g. "220 W · 88% FTP". */
      targetLabel: string;
      /** Seconds remaining in the segment. */
      remainingSec: number;
      /** Total segment duration in seconds. */
      durationSec: number;
      /** Workout elapsed seconds (for overall progress). */
      workoutElapsedSec: number;
      /** Total workout duration seconds. */
      workoutDurationSec: number;
    }
  | {
      type: 'toast';
      t: number;
      id: string;
      kind: 'success' | 'info' | 'warning' | 'error';
      title: string;
      message?: string;
    };

// ---------------------------------------------------------------------------
// Channel handle
// ---------------------------------------------------------------------------

const CHANNEL_NAME = 'globeride.companion.v1';

/** How long since the last hello before we consider the peer gone (ms). */
export const PRESENCE_TIMEOUT_MS = 8_000;

export interface CompanionChannel {
  /** Send a message to all other tabs on the same channel. */
  post(msg: CompanionMessage): void;
  /**
   * Subscribe to incoming messages from *other* tabs.
   * Returns an unsubscribe function.
   */
  onMessage(fn: (msg: CompanionMessage) => void): () => void;
  /** Broadcast `bye` and close the channel. */
  close(): void;
}

/**
 * Open the companion BroadcastChannel.
 * Posts `hello` immediately; posts `bye` on close().
 */
export function openCompanionChannel(role: 'phone' | 'tablet'): CompanionChannel {
  const bc = new BroadcastChannel(CHANNEL_NAME);
  const listeners = new Set<(msg: CompanionMessage) => void>();

  bc.onmessage = (ev: MessageEvent<CompanionMessage>) => {
    const msg = ev.data;
    if (!msg || typeof msg.type !== 'string') return;
    listeners.forEach((fn) => fn(msg));
  };

  // Announce presence.
  bc.postMessage({ type: 'hello', role, t: Date.now() } satisfies CompanionMessage);

  return {
    post(msg) {
      bc.postMessage(msg);
    },

    onMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    close() {
      try {
        bc.postMessage({ type: 'bye', role, t: Date.now() } satisfies CompanionMessage);
      } catch {
        // Ignore — channel may already be closing.
      }
      bc.close();
      listeners.clear();
    },
  };
}
