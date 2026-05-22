import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { Landing } from '@/routes/Landing';
import { Home } from '@/routes/Home';
import { Ride } from '@/routes/Ride';
import { Explore } from '@/routes/Explore';
import { Toaster } from '@/components/Toaster';
import { TrainerEventBridge } from '@/components/TrainerEventBridge';

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
    </BrowserRouter>
  );
}
