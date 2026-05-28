/**
 * DrawRoute — /draw
 *
 * Shallow redirect to the Explore globe, which already hosts the full
 * RouteDrawer overlay. Arriving at /draw automatically deep-links the
 * user into draw mode so they land ready to click waypoints.
 *
 * We use a Navigate redirect rather than duplicating the Cesium globe
 * setup — the single globe instance in Explore.tsx is the authoritative
 * viewer; duplicating it would double the GPU footprint and the Cesium
 * ion token wiring.
 */

import { Navigate } from 'react-router-dom';

/**
 * /draw redirects to /explore. The RouteDrawer is already mounted there
 * as an overlay; users can immediately start clicking waypoints.
 */
export function DrawRoute() {
  return <Navigate to="/explore?draw=1" replace />;
}
