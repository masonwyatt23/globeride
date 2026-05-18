# GlobeRide — Claude project context

## What this is

Open-source, browser-based **virtual cycling simulator**. Upload a GPX
route (Strava/Komoot/Garmin), see it on a photorealistic Cesium 3D globe
(real terrain + OSM 3D buildings), and a Web-Bluetooth FTMS smart trainer
(Wahoo Kickr Core etc.) simulates the real-world gradient as you ride.
Record → export `.FIT` → push to Strava. No accounts, no subscriptions,
no backend. MIT-licensed, self-hostable static site.

Repo: `github.com/masonwyatt23/globeride` (public). Phase 1 MVP + Phase 2
(full cycling-power physics model, rider settings panel, upgraded 3D
avatar) are merged to `main`.

## Stack

Vite 6 · React 19 · TypeScript (strict, project refs) · CesiumJS 1.131
(`vite-plugin-cesium`) · Zustand 5 (state) · Tailwind 3 · react-router 7 ·
Recharts (elevation profile) · `idb` (IndexedDB route library) ·
`vite-plugin-pwa` (installable, offline). No server — everything is
client-side and local-first.

## Commands

```bash
npm run dev         # Vite dev server → http://localhost:5173
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build → ./dist (static)
npm run preview     # serve the build → :4173
```

Node: developed against React 19 / Vite 6. This machine runs Node 25 —
install + typecheck + build verified green here. If a future toolchain
bump breaks, fall back to Node 22 LTS.

## Cesium ion token (required for the 3D globe)

The globe will not render without a Cesium ion access token. Resolution
order, in `src/routes/Explore.tsx`:

1. `import.meta.env.VITE_CESIUM_ION_TOKEN` — set in a gitignored
   `.env.local` at repo root: `VITE_CESIUM_ION_TOKEN=eyJhbGciOi...`
2. `localStorage['globeride.cesiumIonToken']` — persisted by the in-app
   `CesiumTokenPrompt` (Explore.tsx writes this on submit).
3. Otherwise the `CesiumTokenPrompt` UI asks for one and saves it.

Token is free + unlimited for personal use at `ion.cesium.com/tokens`.
`.env.local` is gitignored (`.gitignore` lines 25-27) — never commit it.
Clone/install/typecheck/build do **not** need the token; only live-globe
rendering does.

## Architecture map

- `src/lib/ftms.ts` — Web Bluetooth FTMS client (service `0x1826`,
  Control Point `0x2AD9`, Indoor Bike Data `0x2AD2`, sim params opcode
  `0x11`). The load-bearing file. Reference flow:
  `wklenk/web-bluetooth-bike-trainer`.
- `src/lib/gpxParser.ts` — GPX → normalized Route + distance-indexed
  interpolation.
- `src/lib/gradientCalculator.ts` — windowed % slope, EMA smoothed
  (α=0.18), clamped ±25 %.
- `src/lib/physics.ts` — steady-state cycling-power balance (Martin et
  al. 1998), Newton-Raphson solve; drives Demo Mode and FTMS sim params.
- `src/lib/fitExporter.ts` — hand-rolled FIT v2 binary writer
  (Strava-ready).
- `src/lib/routeLibrary.ts` / `routeGenerator.ts` / `geocoder.ts` —
  IndexedDB route library, auto-generated routes, Nominatim search.
- `src/components/CesiumViewer.tsx` — 3D globe, route entity, chase-cam,
  3D rider/bike avatar.
- `src/stores/` — Zustand: `rideStore` (ride + trainer state),
  `settingsStore` (persisted rider config), `themeStore`.
- `src/hooks/useRideLoop.ts` — requestAnimationFrame core loop;
  `useWakeLock.ts` — screen wake-lock during a ride.
- `src/routes/` — `Home.tsx` (setup), `Ride.tsx` (active ride),
  `Explore.tsx` (token gate + globe mount).

## Conventions / constraints

- **No backend, local-first.** Don't introduce a server or central
  store; persistence is localStorage + IndexedDB only.
- Web Bluetooth is Chrome/Edge desktop+Android only — Safari/iOS use
  Demo Mode. Don't assume BLE is available; always keep Demo Mode working.
- One FTMS consumer at a time — document any change touching connect flow.
- Match existing style: functional React, Zustand selectors, Tailwind +
  the shadcn-style `ui/` primitives, `@/` path alias.

## Roadmap (not yet started — pick one to build next)

Multi-rider ghost peloton (WebRTC) · local-first segment leaderboards ·
draw-a-route-on-map + OSM/SRTM elevation · cadence/HR BLE sensor pairing ·
FTMS steering (Kickr v6) · weather overlay · Strava import by URL ·
`.FIT` ride replay.
