/**
 * planStore — local-first training plan progress.
 *
 * Persists the active plan + completed days to localStorage via Zustand's
 * persist middleware. No backend required.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PlanProgress } from '@/lib/trainingPlans';

interface PlanStoreState {
  /** The currently active plan progress, or null if no plan is running. */
  activePlan: PlanProgress | null;

  /** Start a plan (or restart it from scratch). */
  startPlan: (planId: string) => void;

  /** Mark a day complete (idempotent). */
  completeDay: (day: number) => void;

  /** Unmark a day (for corrections). */
  uncompleteDay: (day: number) => void;

  /** Abandon the active plan. */
  abandonPlan: () => void;
}

export const usePlanStore = create<PlanStoreState>()(
  persist(
    (set) => ({
      activePlan: null,

      startPlan: (planId) =>
        set({
          activePlan: {
            planId,
            startedAt: Date.now(),
            completedDays: [],
          },
        }),

      completeDay: (day) =>
        set((s) => {
          if (!s.activePlan) return s;
          const already = s.activePlan.completedDays.includes(day);
          if (already) return s;
          return {
            activePlan: {
              ...s.activePlan,
              completedDays: [...s.activePlan.completedDays, day].sort((a, b) => a - b),
            },
          };
        }),

      uncompleteDay: (day) =>
        set((s) => {
          if (!s.activePlan) return s;
          return {
            activePlan: {
              ...s.activePlan,
              completedDays: s.activePlan.completedDays.filter((d) => d !== day),
            },
          };
        }),

      abandonPlan: () => set({ activePlan: null }),
    }),
    {
      name: 'globeride.planProgress.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
