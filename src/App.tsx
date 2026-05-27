import React, { Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { Landing } from '@/routes/Landing';
import { Home } from '@/routes/Home';
import { DrawRoute } from '@/routes/DrawRoute';
import { Toaster } from '@/components/setup/Toaster';
import { TrainerEventBridge } from '@/components/trainer/TrainerEventBridge';
import { Onboarding } from '@/components/profile/Onboarding';
import { AchievementToast } from '@/components/ride/AchievementToast';
import { useRaceResultCardAutoToast } from '@/hooks/useRaceResultCardAutoToast';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

const Ride = React.lazy(() => import('@/routes/Ride').then(m => ({ default: m.Ride })));
const Explore = React.lazy(() => import('@/routes/Explore').then(m => ({ default: m.Explore })));
const Companion = React.lazy(() => import('@/routes/Companion').then(m => ({ default: m.Companion })));
const Replay = React.lazy(() => import('@/routes/Replay').then(m => ({ default: m.Replay })));
const WorkoutBuilderRoute = React.lazy(() => import('@/routes/WorkoutBuilderRoute').then(m => ({ default: m.WorkoutBuilderRoute })));

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
          <Route path="/" element={<RouteErrorBoundary routeName="Landing"><Landing /></RouteErrorBoundary>} />
          {/* Ride-setup app */}
          <Route path="/app" element={<RouteErrorBoundary routeName="Home"><Home /></RouteErrorBoundary>} />
          <Route path="/explore" element={<RouteErrorBoundary routeName="Explore"><Suspense fallback={<LoadingFallback />}><Explore /></Suspense></RouteErrorBoundary>} />
          <Route path="/ride" element={<RouteErrorBoundary routeName="Ride"><Suspense fallback={<LoadingFallback />}><Ride /></Suspense></RouteErrorBoundary>} />
          {/* Phone companion screen — same-origin BroadcastChannel peer */}
          <Route path="/companion" element={<RouteErrorBoundary routeName="Companion"><Suspense fallback={<LoadingFallback />}><Companion /></Suspense></RouteErrorBoundary>} />
          {/* Draw a route on the globe — redirects to /explore with draw mode ready */}
          <Route path="/draw" element={<RouteErrorBoundary routeName="Draw"><DrawRoute /></RouteErrorBoundary>} />
          {/* Cinematic replay */}
          <Route path="/replay/:rideId" element={<RouteErrorBoundary routeName="Replay"><Suspense fallback={<LoadingFallback />}><Replay /></Suspense></RouteErrorBoundary>} />
          {/* Custom workout builder */}
          <Route path="/workouts/new" element={<RouteErrorBoundary routeName="Workout Builder"><Suspense fallback={<LoadingFallback />}><WorkoutBuilderRoute /></Suspense></RouteErrorBoundary>} />
          <Route path="/workouts/:id/edit" element={<RouteErrorBoundary routeName="Workout Builder"><Suspense fallback={<LoadingFallback />}><WorkoutBuilderRoute /></Suspense></RouteErrorBoundary>} />
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
