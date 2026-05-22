/**
 * onboardingStore — tracks whether the user has completed or dismissed the
 * first-run onboarding overlay. Persisted to localStorage so it only shows once.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface OnboardingStoreState {
  /** True once the user has completed or explicitly skipped onboarding. */
  hasSeenOnboarding: boolean;
  /** Mark onboarding as seen and close the overlay. */
  dismiss: () => void;
}

export const useOnboardingStore = create<OnboardingStoreState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      dismiss: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'globeride.onboarding.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
