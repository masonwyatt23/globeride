/**
 * segmentStore — Zustand persist store for personal segment records.
 *
 * Persists to localStorage under key 'globeride.segments.v1'.
 * Key: segment.id (stable, derived from route + start/end distance).
 *
 * For each segment we track:
 *   - bestTimeSec  — personal best elapsed time (seconds)
 *   - attempts     — last N attempts (time + date), newest first
 *
 * Actions:
 *   recordAttempt(segmentId, timeSec, attemptedAt?)
 *     → saves the attempt; updates bestTimeSec if it's a new PR.
 *   getRecord(segmentId)
 *     → returns the SegmentRecord for that id (or undefined).
 *   clearAll()
 *     → wipes the entire store (for dev / reset).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface SegmentAttempt {
  /** Elapsed time for this attempt, seconds. */
  timeSec: number;
  /** Unix ms when the attempt was recorded. */
  attemptedAt: number;
}

export interface SegmentRecord {
  /** Mirrors the Segment.id from segments.ts. */
  segmentId: string;
  /** Personal-best elapsed time, seconds. */
  bestTimeSec: number;
  /** All attempts recorded for this segment, newest first. Max 50. */
  attempts: SegmentAttempt[];
  /** Unix ms of the last (most recent) attempt. */
  lastAttemptAt: number;
}

// ---------------------------------------------------------------------------
// Store state + actions
// ---------------------------------------------------------------------------

interface SegmentStoreState {
  /** Map from segmentId → SegmentRecord. Serialised to localStorage. */
  records: Record<string, SegmentRecord>;

  /**
   * Record a completed attempt. Creates a new SegmentRecord if one doesn't
   * exist, updates bestTimeSec when the new time is faster. Returns true
   * if this attempt is a new PR.
   */
  recordAttempt: (segmentId: string, timeSec: number, attemptedAt?: number) => boolean;

  /** Retrieve the record for a given segment, or undefined. */
  getRecord: (segmentId: string) => SegmentRecord | undefined;

  /** Wipe all stored segment records. */
  clearAll: () => void;
}

// Maximum attempt history kept per segment.
const MAX_ATTEMPTS = 50;

export const useSegmentStore = create<SegmentStoreState>()(
  persist(
    (set, get) => ({
      records: {},

      recordAttempt: (segmentId, timeSec, attemptedAt = Date.now()) => {
        let isNewPr = false;

        set((state) => {
          const existing = state.records[segmentId];

          const attempt: SegmentAttempt = { timeSec, attemptedAt };

          if (!existing) {
            // First attempt ever on this segment → automatically a PR.
            isNewPr = true;
            const record: SegmentRecord = {
              segmentId,
              bestTimeSec: timeSec,
              attempts: [attempt],
              lastAttemptAt: attemptedAt,
            };
            return { records: { ...state.records, [segmentId]: record } };
          }

          // Existing record — check if this is a PR.
          isNewPr = timeSec < existing.bestTimeSec;
          const newBest = isNewPr ? timeSec : existing.bestTimeSec;

          // Prepend new attempt and keep at most MAX_ATTEMPTS.
          const attempts = [attempt, ...existing.attempts].slice(0, MAX_ATTEMPTS);

          const record: SegmentRecord = {
            ...existing,
            bestTimeSec: newBest,
            attempts,
            lastAttemptAt: attemptedAt,
          };

          return { records: { ...state.records, [segmentId]: record } };
        });

        return isNewPr;
      },

      getRecord: (segmentId) => get().records[segmentId],

      clearAll: () => set({ records: {} }),
    }),
    {
      name: 'globeride.segments.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Persist only the records dictionary.
      partialize: (s) => ({ records: s.records }),
    },
  ),
);
