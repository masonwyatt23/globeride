# `src/lib/strava/` — Strava live segment fetching and 3D portal gates

## What's here

- `segments.ts` — Strava API client: fetches segments near a route (`/segments/explore`) and per-segment PR data (`/segments/{id}`); results cached in `localStorage` with a 7-day TTL
- `segmentPortals.ts` — Cesium visual layer: glowing aqua ring gate at each segment start, checkered-flag billboard at end, floating name label; managed as a single `PrimitiveCollection` for bulk teardown

## Public API

```ts
// segments.ts
fetchSegmentsNearRoute(route: Route, accessToken: string): Promise<StravaSegment[]>
// Chunks the route into bounding boxes, de-duplicates by segment ID, caps at 25 results.
// Caches per route.id in localStorage (key: `${routeId}:strava-segments`).

fetchSegmentEffortHistory(segmentId: number, accessToken: string): Promise<{ prTime?: number; effortCount: number }>

clearSegmentCache(routeId: string): void

// StravaSegment: { id, name, distance, avgGrade, maxGrade, startLat, startLon, endLat, endLon, climbCategory }

// segmentPortals.ts
createSegmentPortals(viewer: Cesium.Viewer, segments: RouteSegment[], route: Route): SegmentPortalHandle
// SegmentPortalHandle: { destroy(): void }
```

## How it's consumed

- `src/routes/Ride.tsx` — kicks off `fetchSegmentsNearRoute` after a route is loaded; stores results in component state
- `src/components/ride/CesiumViewer.tsx` — calls `createSegmentPortals` to add gates; calls `handle.destroy()` on unmount or route change
- `src/components/ride/RideControls.tsx` — displays segment name and PR time during a segment attempt
- `src/components/profile/SettingsPanel.tsx` — Strava OAuth token entry
- `src/lib/segmentOverlay.ts` — computes `RouteSegment[]` (route-distance–indexed segment bounds) consumed by `segmentPortals`

## Constraints / gotchas

- **Auth required**: all API calls need a valid Strava OAuth access token with `activity:read` scope. Token is stored in `localStorage` — not managed by this module.
- **Reverse proxy**: all HTTP goes through `/strava-api/*` (Vite dev proxy → `https://api.strava.com`). Production deployments must expose the same proxy path or a serverless route. The API key is never sent to the browser directly.
- **Rate limits**: Strava enforces 100 req/15 min / 1000 req/day. The 7-day localStorage cache and the 25-segment cap are the primary mitigation. Do not call these functions per-frame.
- **Cesium primitive cleanup**: `SegmentPortalHandle.destroy()` removes the entire `PrimitiveCollection` in one call. Callers must invoke it on unmount — leaking primitives degrades Cesium render performance.
- **`RouteSegment` type**: defined in `@/lib/segmentOverlay`, not in this directory. `segmentPortals.ts` imports from there.
