/**
 * ExploreIntro — tasteful glass pill caption for the /explore globe page.
 *
 * Positioned absolutely at the top-centre of the globe, above the search bar.
 * Uses backdrop-blur + semi-transparent dark background (the "glass pill"
 * pattern consistent with the rest of the app's overlay UI).
 *
 * Integration note: mount as <ExploreIntro totalRoutes={n} /> anywhere in
 * the Explore JSX — recommended placement is just inside the outer
 * `relative w-full h-full` container, before the top overlay div.
 */

import { ICONIC_ROUTES } from '@/lib/iconicRoutes';
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';

interface ExploreIntroProps {
  /** Override total route count (defaults to sum of both catalogs). */
  totalRoutes?: number;
}

const DEFAULT_TOTAL = ICONIC_ROUTES.length + WORLD_TOUR_STAGES.length;

export function ExploreIntro({ totalRoutes = DEFAULT_TOTAL }: ExploreIntroProps) {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-1">
      {/* Glass pill */}
      <div
        className="flex flex-col items-center gap-0.5 rounded-full px-5 py-2.5 text-center"
        style={{
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        }}
      >
        <p
          className="text-sm font-medium tracking-wide"
          style={{ color: 'rgba(255,255,255,0.92)' }}
        >
          Tap any marker.&nbsp; Or search a place.&nbsp; Or just spin the world.
        </p>
        <p
          className="text-xs"
          style={{ color: 'rgba(0,255,255,0.65)' }}
        >
          {totalRoutes} routes ready to ride
        </p>
      </div>
    </div>
  );
}
