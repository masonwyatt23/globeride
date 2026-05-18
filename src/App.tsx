import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { Home } from '@/routes/Home';
import { Ride } from '@/routes/Ride';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
