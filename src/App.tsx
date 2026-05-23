import React, { Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { Landing } from '@/routes/Landing';
import { Home } from '@/routes/Home';
import { Toaster } from '@/components/setup/Toaster';
import { TrainerEventBridge } from '@/components/trainer/TrainerEventBridge';
import { Onboarding } from '@/components/profile/Onboarding';
import { AchievementToast } from '@/components/ride/AchievementToast';
import { useRaceResultCardAutoToast } from '@/hooks/useRaceResultCardAutoToast';

const Ride = React.lazy(() => import('@/routes/Ride').then(m => ({ default: m.Ride })));
const Explore = React.lazy(() => import('@/routes/Explore').then(m => ({ default: m.Explore })));
const Companion = React.lazy(() => import('@/routes/Companion').then(m => ({ default: m.Companion })));

function LoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Thin wrapper so the race result auto-toast hook can be called inside the
 * React tree (hooks must live in a component). Renders nothing.
 */
function RaceResultAutoToast() {
  useRaceResultCardAutoToast();
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <TrainerEventBridge />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Marketing landing page — public entry point */}
          <Route path="/" element={<Landing />} />
          {/* Ride-setup app (formerly /) */}
          <Route path="/app" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/ride" element={<Ride />} />
          {/* Phone companion screen — same-origin BroadcastChannel peer */}
          <Route path="/companion" element={<Companion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
      <Onboarding />
      <AchievementToast />
      {/* Race result card auto-toast — surfaces "Download result card" after a race */}
      <RaceResultAutoToast />
    </BrowserRouter>
  );
}
