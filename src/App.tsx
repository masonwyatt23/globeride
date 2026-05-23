import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { Landing } from '@/routes/Landing';
import { Home } from '@/routes/Home';
import { Ride } from '@/routes/Ride';
import { Explore } from '@/routes/Explore';
import { Toaster } from '@/components/setup/Toaster';
import { TrainerEventBridge } from '@/components/trainer/TrainerEventBridge';
import { Onboarding } from '@/components/profile/Onboarding';
import { AchievementToast } from '@/components/ride/AchievementToast';
import { useRaceResultCardAutoToast } from '@/hooks/useRaceResultCardAutoToast';

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
      <Routes>
        {/* Marketing landing page — public entry point */}
        <Route path="/" element={<Landing />} />
        {/* Ride-setup app (formerly /) */}
        <Route path="/app" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
      <Onboarding />
      <AchievementToast />
      {/* Race result card auto-toast — surfaces "Download result card" after a race */}
      <RaceResultAutoToast />
    </BrowserRouter>
  );
}
